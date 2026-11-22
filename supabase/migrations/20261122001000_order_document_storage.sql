-- Milestone 11A. PREPARED ONLY: approval required before database/Storage changes.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('order-documents', 'order-documents', false, 10485760, ARRAY['application/pdf']);

CREATE TABLE public.order_documents (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    object_path text GENERATED ALWAYS AS (order_id::text || '/' || id::text || '.pdf') STORED UNIQUE,
    file_name text NOT NULL CHECK (
        file_name ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,115}\.pdf$' AND position('..' in file_name) = 0
    ),
    byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_documents_order_created_idx ON public.order_documents(order_id, created_at);
CREATE INDEX order_documents_uploaded_by_idx ON public.order_documents(uploaded_by);
ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_documents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.order_documents TO authenticated;

-- Parent RLS already distinguishes active admins and active own-organization dealers.
CREATE POLICY order_documents_read_visible_order ON public.order_documents
FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_documents.order_id
));

-- Standard authenticated upload only. UUID-only paths never contain display names.
CREATE POLICY order_documents_object_upload ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'order-documents'
    AND storage.allow_only_operation('object.upload')
    AND (SELECT private.is_active_admin())
    AND name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$'
    AND metadata->>'mimetype' = 'application/pdf'
    AND (metadata->'size' IS NULL OR CASE WHEN jsonb_typeof(metadata->'size') = 'number'
        THEN (metadata->>'size')::numeric BETWEEN 1 AND 10485760 ELSE false END)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = split_part(name, '/', 1))
);

-- No sign/sign_many operations: downloads require a current user JWT each time.
-- Admins may read pending uploads for validation/recovery; dealers see published rows only.
CREATE POLICY order_documents_object_read ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'order-documents' AND NOT is_delete_marker AND NOT is_versioned
    AND (storage.allow_any_operation(ARRAY['object.get_authenticated', 'object.list', 'object.list_v2'])
        OR (storage.allow_only_operation('object.upload') AND (SELECT private.is_active_admin())))
    AND (
        ((SELECT private.is_active_admin()) AND EXISTS (
            SELECT 1 FROM public.orders o WHERE name LIKE o.id::text || '/%'
        ))
        OR EXISTS (SELECT 1 FROM public.order_documents d WHERE d.object_path = name)
    )
);

-- Only the trusted PDF-publish Edge function may register parser-validated bytes.
-- The caller JWT is used for all file reads; its verified Auth ID is passed here.
CREATE FUNCTION private.register_order_document(
    p_actor_id uuid, p_order_id uuid, p_document_id uuid, p_file_name text, p_byte_size integer
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    path text := p_order_id::text || '/' || p_document_id::text || '.pdf';
    object record;
    existing public.order_documents%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE p.id = p_actor_id FOR SHARE OF p, r;
    IF NOT FOUND OR NOT EXISTS (
        SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
        WHERE p.id = p_actor_id AND p.is_active AND r.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'An active administrator is required' USING ERRCODE = '42501';
    END IF;
    IF p_order_id IS NULL OR p_document_id IS NULL OR p_file_name IS NULL
       OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760 THEN
        RAISE EXCEPTION 'Invalid PDF registration' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.orders o WHERE o.id = p_order_id FOR KEY SHARE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An existing order is required' USING ERRCODE = '22023';
    END IF;
    SELECT s.metadata, COALESCE(s.owner_id, s.owner::text) AS uploader INTO object
    FROM storage.objects s WHERE s.bucket_id = 'order-documents' AND s.name = path
        AND NOT s.is_delete_marker AND NOT s.is_versioned FOR SHARE OF s;
    IF NOT FOUND OR object.uploader IS DISTINCT FROM p_actor_id::text
       OR object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf'
       OR jsonb_typeof(object.metadata->'size') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'An uploaded PDF owned by this admin is required' USING ERRCODE = '22023';
    END IF;
    IF (object.metadata->>'size')::numeric <> p_byte_size THEN
        RAISE EXCEPTION 'PDF size does not match stored bytes' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.order_documents(id, order_id, uploaded_by, file_name, byte_size)
    VALUES (p_document_id, p_order_id, p_actor_id, p_file_name, p_byte_size)
    ON CONFLICT (id) DO NOTHING;
    SELECT * INTO existing FROM public.order_documents WHERE id = p_document_id;
    IF existing.order_id <> p_order_id OR existing.uploaded_by <> p_actor_id
       OR existing.file_name <> p_file_name OR existing.byte_size <> p_byte_size THEN
        RAISE EXCEPTION 'Document identity already has different metadata' USING ERRCODE = 'PT409';
    END IF;
    RETURN p_document_id;
END;
$$;

CREATE FUNCTION public.register_order_document(
    p_actor_id uuid, p_order_id uuid, p_document_id uuid, p_file_name text, p_byte_size integer
)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.register_order_document(p_actor_id, p_order_id, p_document_id, p_file_name, p_byte_size); $$;

ALTER FUNCTION private.register_order_document(uuid, uuid, uuid, text, integer) OWNER TO postgres;
ALTER FUNCTION public.register_order_document(uuid, uuid, uuid, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.register_order_document(uuid, uuid, uuid, text, integer),
    public.register_order_document(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.register_order_document(uuid, uuid, uuid, text, integer),
    public.register_order_document(uuid, uuid, uuid, text, integer) TO service_role;

-- No managed object-row DML, UPDATE/DELETE policies, public URLs or client metadata writes.
COMMIT;
