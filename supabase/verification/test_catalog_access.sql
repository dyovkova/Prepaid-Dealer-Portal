-- Run locally now, or on the hosted project only after explicit approval.
-- Requires applied 5A and controlled dealer/admin UUIDs supplied as settings:
-- pdp.catalog_dealer_id and pdp.catalog_admin_id (not emails/passwords).
-- No Auth inserts or role promotion. Product/status fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    dealer_user uuid := NULLIF(current_setting('pdp.catalog_dealer_id', true), '')::uuid;
    admin_user uuid := NULLIF(current_setting('pdp.catalog_admin_id', true), '')::uuid;
    organization uuid;
    active_product uuid;
    archived_product uuid;
    expected_active bigint;
    visible bigint;
    actor uuid;
    resource text;
    statement text;
    denied_count integer := 0;
BEGIN
    IF dealer_user IS NULL OR admin_user IS NULL OR dealer_user = admin_user THEN
        RAISE EXCEPTION 'Supply distinct verified synthetic dealer/admin UUID settings';
    END IF;
    SELECT p.dealer_id INTO STRICT organization
    FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
    JOIN public.dealers d ON d.id=p.dealer_id
    WHERE p.id=dealer_user AND p.is_active AND d.is_active AND r.role='dealer';
    IF NOT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
        WHERE p.id=admin_user AND p.is_active AND r.role='admin') THEN
        RAISE EXCEPTION 'Admin fixture must already be active; never promote a fixture here';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products WHERE sku IN ('PDP-TEST-5A-ACTIVE','PDP-TEST-5A-ARCHIVED')) THEN
        RAISE EXCEPTION 'Test SKU collision; do not alter existing products';
    END IF;
    INSERT INTO public.products (sku,name,description,unit_price,is_active)
    VALUES ('PDP-TEST-5A-ACTIVE','Synthetic security fixture','Rollback only',1.25,true)
    RETURNING id INTO active_product;
    INSERT INTO public.products (sku,name,description,unit_price,is_active)
    VALUES ('PDP-TEST-5A-ARCHIVED','Synthetic archived fixture','Rollback only',2.50,false)
    RETURNING id INTO archived_product;
    SELECT count(*) INTO expected_active FROM public.products WHERE is_active;

    -- Allowed reads require both an application dealer role and live status.
    PERFORM set_config('request.jwt.claim.sub', dealer_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',dealer_user,'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.products;
    IF visible <> expected_active THEN RAISE EXCEPTION 'Active dealer catalog read failed'; END IF;
    SELECT count(*) INTO visible FROM public.products WHERE id=active_product AND unit_price=1.25;
    IF visible <> 1 THEN RAISE EXCEPTION 'Active product lookup failed'; END IF;
    SELECT count(*) INTO visible FROM public.products WHERE id=archived_product OR NOT is_active;
    IF visible <> 0 THEN RAISE EXCEPTION 'Archived products leaked through direct lookup/filter'; END IF;
    RESET ROLE;

    -- Same JWT settings remain in place while trusted activation changes.
    UPDATE public.profiles SET is_active=false WHERE id=dealer_user;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.products;
    IF visible <> 0 THEN RAISE EXCEPTION 'Inactive profile retained catalog access'; END IF;
    RESET ROLE;
    UPDATE public.profiles SET is_active=true WHERE id=dealer_user;
    UPDATE public.dealers SET is_active=false WHERE id=organization;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.products;
    IF visible <> 0 THEN RAISE EXCEPTION 'Inactive organization retained catalog access'; END IF;
    RESET ROLE;
    UPDATE public.dealers SET is_active=true WHERE id=organization;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.products;
    IF visible <> expected_active THEN RAISE EXCEPTION 'Restored dealer access did not recover'; END IF;
    RESET ROLE;

    -- Admin, missing-profile and missing-subject callers get no catalog rows.
    FOREACH actor IN ARRAY ARRAY[admin_user,'00000000-0000-4000-8000-000000005aff'::uuid,NULL::uuid] LOOP
        PERFORM set_config('request.jwt.claim.sub', COALESCE(actor::text,''), true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated','user_metadata',json_build_object('role','dealer','is_active',true))::text, true);
        SET LOCAL ROLE authenticated;
        SELECT count(*) INTO visible FROM public.products;
        IF visible <> 0 THEN RAISE EXCEPTION 'Non-dealer or missing identity gained catalog access'; END IF;
        RESET ROLE;
    END LOOP;

    -- Assert actual statement denials, including attempts against archived rows.
    FOREACH resource IN ARRAY ARRAY['anon','dealer','admin'] LOOP
        actor := CASE resource WHEN 'dealer' THEN dealer_user WHEN 'admin' THEN admin_user ELSE NULL END;
        PERFORM set_config('request.jwt.claim.sub', COALESCE(actor::text,''), true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub',actor,'role',CASE resource WHEN 'anon' THEN 'anon' ELSE 'authenticated' END)::text, true);
        IF resource='anon' THEN SET LOCAL ROLE anon; ELSE SET LOCAL ROLE authenticated; END IF;
        IF resource='anon' THEN
            BEGIN
                PERFORM 1 FROM public.products;
                RAISE EXCEPTION 'Anonymous catalog read allowed';
            EXCEPTION WHEN insufficient_privilege THEN denied_count := denied_count + 1;
            END;
        END IF;
        FOREACH statement IN ARRAY ARRAY[
            'INSERT INTO public.products(sku,name,unit_price) VALUES (''PDP-TEST-5A-FORBIDDEN'',''Forbidden'',1)',
            'UPDATE public.products SET unit_price=0',
            'UPDATE public.products SET is_active=true WHERE NOT is_active',
            'DELETE FROM public.products',
            'TRUNCATE public.products',
            'SELECT * FROM public.orders',
            'SELECT * FROM public.order_items'
        ] LOOP
            BEGIN
                EXECUTE statement;
                RAISE EXCEPTION 'Forbidden % statement allowed: %', resource, statement;
            EXCEPTION WHEN insufficient_privilege THEN denied_count := denied_count + 1;
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;
    IF denied_count <> 22 THEN RAISE EXCEPTION 'Expected 22 client privilege denials, got %', denied_count; END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.products'::regclass)
       OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='products') <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products'
           AND policyname='products_read_active_dealer' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[]) THEN
        RAISE EXCEPTION 'Unexpected product RLS/policy configuration';
    END IF;
END;
$$;

ROLLBACK;
SELECT 'passed; catalog/status fixtures and JWT settings rolled back' AS result;
