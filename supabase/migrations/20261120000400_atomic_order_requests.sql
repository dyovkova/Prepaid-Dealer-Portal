-- Milestone 6A: backend only. Review and obtain approval before remote use.
BEGIN;

-- Pure input validation/canonicalization. Never accepts client prices/ownership.
CREATE FUNCTION private.validate_order_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    item jsonb;
    product_id uuid;
    amount numeric;
    seen uuid[] := '{}';
    normalized jsonb := '[]';
BEGIN
    IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'items must be an array' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'Supply between 1 and 100 order items' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
        IF pg_catalog.jsonb_typeof(item) <> 'object' THEN
            RAISE EXCEPTION 'Each item must be an object' USING ERRCODE = '22023';
        END IF;
        IF (item - 'product_id' - 'quantity') <> '{}'::jsonb
           OR pg_catalog.jsonb_typeof(item -> 'product_id') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(item -> 'quantity') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Each item accepts only product_id and numeric quantity' USING ERRCODE = '22023';
        END IF;
        BEGIN
            product_id := (item ->> 'product_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'Invalid product UUID' USING ERRCODE = '22023';
        END;
        amount := (item ->> 'quantity')::numeric;
        IF amount < 1 OR amount > 2147483647 OR amount <> pg_catalog.trunc(amount)
           OR product_id = ANY(seen) THEN
            RAISE EXCEPTION 'Use unique products and positive integer quantities' USING ERRCODE = '22023';
        END IF;
        seen := pg_catalog.array_append(seen, product_id);
        normalized := normalized || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'product_id', product_id, 'quantity', amount::integer));
    END LOOP;
    RETURN (SELECT pg_catalog.jsonb_agg(value ORDER BY (value ->> 'product_id')::uuid)
        FROM pg_catalog.jsonb_array_elements(normalized));
END;
$$;

-- Lock before checking: status/membership/role cannot change until transaction end.
CREATE FUNCTION private.lock_order_dealer()
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    actor uuid := auth.uid();
    organization uuid;
    active boolean;
BEGIN
    IF actor IS NULL THEN
        RAISE EXCEPTION 'An active dealer account is required' USING ERRCODE = '42501';
    END IF;
    SELECT p.dealer_id, p.is_active INTO organization, active
    FROM public.profiles p WHERE p.id = actor FOR SHARE OF p;
    IF NOT FOUND OR NOT active OR organization IS NULL THEN
        RAISE EXCEPTION 'An active dealer account is required' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.user_roles r
    WHERE r.user_id = actor AND r.role = 'dealer' FOR SHARE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An active dealer account is required' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.dealers d WHERE d.id = organization AND d.is_active FOR SHARE OF d;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An active dealer organization is required' USING ERRCODE = '42501';
    END IF;
    RETURN organization;
END;
$$;

-- Called only with validated items. Sorted SHARE locks block price/name/archive
-- edits while allowing concurrent submissions. Copy values from the locked rows.
CREATE FUNCTION private.lock_order_products(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    product record;
    snapshots jsonb := '[]';
BEGIN
    FOR product IN
        SELECT p.id, p.sku, p.name, p.unit_price, p.is_active, i.quantity
        FROM public.products p
        JOIN pg_catalog.jsonb_to_recordset(p_items) AS i(product_id uuid, quantity integer) ON i.product_id = p.id
        ORDER BY p.id FOR SHARE OF p
    LOOP
        IF NOT product.is_active THEN
            RAISE EXCEPTION 'An order product is missing or inactive' USING ERRCODE = '22023';
        END IF;
        snapshots := snapshots || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'product_id', product.id, 'quantity', product.quantity,
            'sku', product.sku, 'name', product.name, 'unit_price', product.unit_price));
    END LOOP;
    IF pg_catalog.jsonb_array_length(snapshots) <> pg_catalog.jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'An order product is missing or inactive' USING ERRCODE = '22023';
    END IF;
    RETURN snapshots;
END;
$$;

-- Sole privileged entry point: no actor/organization/status/price parameters.
CREATE FUNCTION private.create_order(p_request_id uuid, p_items jsonb, p_note text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    actor uuid := auth.uid();
    organization uuid;
    items jsonb;
    note text;
    existing public.orders%ROWTYPE;
    saved_items jsonb;
    snapshots jsonb;
    order_id uuid;
BEGIN
    organization := private.lock_order_dealer();
    IF p_request_id IS NULL OR pg_catalog.char_length(p_note) > 2000 THEN
        RAISE EXCEPTION 'A request UUID and note of at most 2000 characters are required' USING ERRCODE = '22023';
    END IF;
    items := private.validate_order_items(p_items);
    note := NULLIF(pg_catalog.btrim(p_note), '');

    -- Same creator/key serializes even before an order row exists. Hash collisions
    -- only serialize unrelated calls; the existing UNIQUE key remains definitive.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'pdp:order:' || actor::text || ':' || p_request_id::text, 0));
    SELECT o.* INTO existing FROM public.orders o
    WHERE o.created_by = actor AND o.request_id = p_request_id;
    IF FOUND THEN
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'product_id', i.product_id, 'quantity', i.quantity) ORDER BY i.product_id)
        INTO saved_items FROM public.order_items i WHERE i.order_id = existing.id;
        IF existing.dealer_id IS DISTINCT FROM organization
           OR existing.note IS DISTINCT FROM note OR saved_items IS DISTINCT FROM items THEN
            RAISE EXCEPTION 'request_id was already used with different order contents' USING ERRCODE = '23505';
        END IF;
        -- Exact retry returns the original snapshot, even after catalog changes.
        RETURN existing.id;
    END IF;

    snapshots := private.lock_order_products(items);
    INSERT INTO public.orders (dealer_id, created_by, status, note, request_id)
    VALUES (organization, actor, 'submitted', note, p_request_id) RETURNING id INTO order_id;
    INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_snapshot, sku_snapshot, name_snapshot)
    SELECT order_id, s.product_id, s.quantity, s.unit_price, s.sku, s.name
    FROM pg_catalog.jsonb_to_recordset(snapshots)
        AS s(product_id uuid, quantity integer, unit_price numeric, sku text, name text);
    RETURN order_id;
END;
$$;

CREATE FUNCTION public.submit_order(p_request_id uuid, p_items jsonb, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.create_order(p_request_id, p_items, p_note); $$;

ALTER FUNCTION private.validate_order_items(jsonb) OWNER TO postgres;
ALTER FUNCTION private.lock_order_dealer() OWNER TO postgres;
ALTER FUNCTION private.lock_order_products(jsonb) OWNER TO postgres;
ALTER FUNCTION private.create_order(uuid, jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.submit_order(uuid, jsonb, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.validate_order_items(jsonb), private.lock_order_dealer(),
    private.lock_order_products(jsonb), private.create_order(uuid, jsonb, text),
    public.submit_order(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_order(uuid, jsonb, text),
    public.submit_order(uuid, jsonb, text) TO authenticated;

-- No table grants/policies: orders/items still deny direct client reads/writes.
-- Private schema stays excluded from the Data API; public wrapper is invoker.
COMMIT;
