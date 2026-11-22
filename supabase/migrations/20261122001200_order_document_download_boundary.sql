-- Require checked Edge downloads; existing CDN entries need a separately approved purge.
BEGIN;

ALTER POLICY order_documents_object_read ON storage.objects USING (
    bucket_id = 'order-documents' AND NOT is_delete_marker AND NOT is_versioned
    AND (storage.allow_any_operation(ARRAY['object.list', 'object.list_v2'])
        OR (storage.allow_only_operation('object.upload') AND (SELECT private.is_active_admin())))
    AND (
        ((SELECT private.is_active_admin()) AND EXISTS (
            SELECT 1 FROM public.orders o WHERE name LIKE o.id::text || '/%'
        ))
        OR EXISTS (SELECT 1 FROM public.order_documents d WHERE d.object_path = name)
    )
);

COMMIT;
