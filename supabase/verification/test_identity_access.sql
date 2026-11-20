-- Run only after applying 4A with two synthetic users created through Supabase Auth.
-- See identity-access.md for signup metadata and the required fixture email addresses.
-- Optional transaction-local pdp.test_email_a/b override the simulation defaults.
-- No auth.users inserts, account promotion, or activation change persists here.
BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    user_a uuid;
    user_b uuid;
    actor uuid;
    organization_a uuid;
    organization_b uuid;
    visible bigint;
    affected bigint;
    statement text;
    resource record;
BEGIN
    SELECT id INTO STRICT user_a FROM auth.users
    WHERE email = COALESCE(NULLIF(current_setting('pdp.test_email_a',true),''),'demo-4a-a@example.invalid')
      AND raw_user_meta_data ->> 'test_fixture' = 'milestone4a';
    SELECT id INTO STRICT user_b FROM auth.users
    WHERE email = COALESCE(NULLIF(current_setting('pdp.test_email_b',true),''),'demo-4a-b@example.invalid')
      AND raw_user_meta_data ->> 'test_fixture' = 'milestone4a';
    SELECT dealer_id INTO STRICT organization_a FROM public.profiles WHERE id = user_a;
    SELECT dealer_id INTO STRICT organization_b FROM public.profiles WHERE id = user_b;

    IF organization_a IS NULL OR organization_b IS NULL OR organization_a = organization_b THEN
        RAISE EXCEPTION 'Signup did not create isolated organizations';
    END IF;
    IF (SELECT count(*) FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
        JOIN public.dealers d ON d.id=p.dealer_id
        WHERE p.id IN (user_a,user_b) AND p.is_active AND d.is_active AND r.role='dealer') <> 2 THEN
        RAISE EXCEPTION 'Missing or incorrect signup profile/role/activation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=user_b
        AND raw_user_meta_data ->> 'role' = 'admin'
        AND raw_user_meta_data ->> 'dealer_id' = organization_a::text
        AND raw_user_meta_data ->> 'is_active' = 'false') THEN
        RAISE EXCEPTION 'Fixture B must request admin, organization A, and inactive status in metadata';
    END IF;

    FOREACH actor IN ARRAY ARRAY[user_a,user_b] LOOP
        PERFORM set_config('request.jwt.claim.sub', actor::text, true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub',actor,'role','authenticated')::text, true);
        SET LOCAL ROLE authenticated;

        SELECT count(*) INTO visible FROM public.profiles;
        IF visible <> 1 THEN RAISE EXCEPTION 'Profile isolation failed'; END IF;
        SELECT count(*) INTO visible FROM public.user_roles;
        IF visible <> 1 THEN RAISE EXCEPTION 'Role isolation failed'; END IF;
        SELECT count(*) INTO visible FROM public.dealers;
        IF visible <> 1 THEN RAISE EXCEPTION 'Organization isolation failed'; END IF;
        SELECT count(*) INTO visible FROM public.profiles p
        JOIN public.user_roles r ON r.user_id=p.id JOIN public.dealers d ON d.id=p.dealer_id;
        IF visible <> 1 THEN RAISE EXCEPTION 'Joined RLS read failed or recursed'; END IF;
        IF private.current_active_dealer_id() IS DISTINCT FROM
           (CASE WHEN actor=user_a THEN organization_a ELSE organization_b END)
           OR private.is_active_admin() THEN
            RAISE EXCEPTION 'Actor helper returned incorrect identity';
        END IF;
        UPDATE public.profiles SET display_name='Synthetic verified dealer' WHERE id=actor;
        GET DIAGNOSTICS affected = ROW_COUNT;
        IF affected <> 1 THEN RAISE EXCEPTION 'Own display-name update failed'; END IF;
        UPDATE public.profiles SET display_name='Forbidden' WHERE id<>actor;
        GET DIAGNOSTICS affected = ROW_COUNT;
        IF affected <> 0 THEN RAISE EXCEPTION 'Cross-user profile update allowed'; END IF;

        FOREACH statement IN ARRAY ARRAY[
            'UPDATE public.user_roles SET role=''admin''',
            'INSERT INTO public.user_roles(user_id,role) VALUES (gen_random_uuid(),''admin'')',
            'DELETE FROM public.user_roles',
            'UPDATE public.profiles SET dealer_id=gen_random_uuid()',
            'UPDATE public.profiles SET is_active=false',
            'UPDATE public.profiles SET id=gen_random_uuid()',
            'UPDATE public.profiles SET created_at=now()',
            'UPDATE public.profiles SET display_name=repeat(''x'',121)',
            'INSERT INTO public.profiles(id,display_name) VALUES (gen_random_uuid(),''Forbidden'')',
            'DELETE FROM public.profiles',
            'UPDATE public.dealers SET name=''Forbidden'',is_active=false',
            'INSERT INTO public.dealers(name) VALUES (''Forbidden'')',
            'DELETE FROM public.dealers',
            'SELECT private.provision_dealer_account()'
        ] LOOP
            BEGIN
                EXECUTE statement;
                RAISE EXCEPTION 'Unauthorized statement succeeded: %', statement;
            EXCEPTION WHEN insufficient_privilege THEN NULL;
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;

    -- Keep the same JWT subject while changing trusted database activation state.
    PERFORM set_config('request.jwt.claim.sub',user_a::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',user_a,'role','authenticated')::text,true);
    UPDATE public.profiles SET is_active=false WHERE id=user_a;
    SET LOCAL ROLE authenticated;
    IF (SELECT count(*) FROM public.profiles) <> 1 OR
       (SELECT count(*) FROM public.user_roles) <> 1 OR
       (SELECT count(*) FROM public.dealers) <> 0 OR
       private.current_active_dealer_id() IS NOT NULL OR private.is_active_admin() THEN
        RAISE EXCEPTION 'Inactive profile restrictions failed';
    END IF;
    UPDATE public.profiles SET display_name='Forbidden inactive edit' WHERE id=user_a;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Inactive profile edit allowed'; END IF;
    RESET ROLE;

    UPDATE public.profiles SET is_active=true WHERE id=user_a;
    UPDATE public.dealers SET is_active=false WHERE id=organization_a;
    SET LOCAL ROLE authenticated;
    IF (SELECT count(*) FROM public.profiles) <> 1 OR
       (SELECT count(*) FROM public.user_roles) <> 1 OR
       (SELECT count(*) FROM public.dealers) <> 0 OR private.current_active_dealer_id() IS NOT NULL THEN
        RAISE EXCEPTION 'Inactive organization restrictions failed';
    END IF;
    UPDATE public.profiles SET display_name='Forbidden inactive organization edit' WHERE id=user_a;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Inactive organization edit allowed'; END IF;
    RESET ROLE;

    -- Trusted temporary promotion exercises the helper without exposing promotion.
    UPDATE public.dealers SET is_active=true WHERE id=organization_a;
    UPDATE public.user_roles SET role='admin' WHERE user_id=user_a;
    SET LOCAL ROLE authenticated;
    IF NOT private.is_active_admin() OR private.current_active_dealer_id() IS NOT NULL OR
       (SELECT count(*) FROM public.profiles) <> 1 OR (SELECT count(*) FROM public.user_roles) <> 1 THEN
        RAISE EXCEPTION 'Admin actor lookup or own-row isolation failed';
    END IF;
    UPDATE public.profiles SET display_name='Synthetic admin' WHERE id=user_a;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Active admin own-name update failed'; END IF;
    BEGIN
        UPDATE public.user_roles SET role='admin' WHERE user_id=user_b;
        RAISE EXCEPTION 'UI admin can promote users';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    UPDATE public.profiles SET is_active=false WHERE id=user_a;
    SET LOCAL ROLE authenticated;
    IF private.is_active_admin() THEN RAISE EXCEPTION 'Inactive admin accepted'; END IF;
    UPDATE public.profiles SET display_name='Forbidden inactive admin edit' WHERE id=user_a;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Inactive admin edit allowed'; END IF;
    RESET ROLE;

    UPDATE public.profiles SET is_active=true WHERE id=user_a;
    DELETE FROM public.user_roles WHERE user_id=user_a;
    SET LOCAL ROLE authenticated;
    IF private.is_active_admin() OR private.current_active_dealer_id() IS NOT NULL OR
       (SELECT count(*) FROM public.dealers) <> 0 THEN
        RAISE EXCEPTION 'Missing role did not deny business access';
    END IF;
    UPDATE public.profiles SET display_name='Forbidden missing-role edit' WHERE id=user_a;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Missing-role profile edit allowed'; END IF;
    RESET ROLE;

    -- Check every still-deferred table as both anon and authenticated (including admin).
    INSERT INTO public.user_roles(user_id,role) VALUES (user_a,'admin');
    FOR resource IN SELECT * FROM (VALUES ('anon'),('authenticated')) AS actors(role_name) LOOP
        EXECUTE format('SET LOCAL ROLE %I',resource.role_name);
        FOREACH statement IN ARRAY ARRAY[
            'SELECT * FROM public.products', 'INSERT INTO public.products DEFAULT VALUES',
            'UPDATE public.products SET unit_price=0', 'DELETE FROM public.products',
            'SELECT * FROM public.orders', 'INSERT INTO public.orders DEFAULT VALUES',
            'UPDATE public.orders SET status=''completed''', 'DELETE FROM public.orders',
            'SELECT * FROM public.order_items', 'INSERT INTO public.order_items DEFAULT VALUES',
            'UPDATE public.order_items SET quantity=1', 'DELETE FROM public.order_items'
        ] LOOP
            BEGIN EXECUTE statement;
                RAISE EXCEPTION 'Deferred table statement allowed: %',statement;
            EXCEPTION WHEN insufficient_privilege THEN NULL;
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub','',true);
    PERFORM set_config('request.jwt.claims','{}',true);
    SET LOCAL ROLE authenticated;
    IF (SELECT count(*) FROM public.profiles) <> 0 OR
       (SELECT count(*) FROM public.user_roles) <> 0 OR
       (SELECT count(*) FROM public.dealers) <> 0 OR
       private.is_active_admin() OR private.current_active_dealer_id() IS NOT NULL THEN
        RAISE EXCEPTION 'Missing authenticated subject granted identity access';
    END IF;
    RESET ROLE;
    SET LOCAL ROLE anon;
    FOREACH statement IN ARRAY ARRAY[
        'SELECT * FROM public.profiles','SELECT * FROM public.user_roles','SELECT * FROM public.dealers',
        'SELECT private.is_active_admin()','SELECT private.current_active_dealer_id()'
    ] LOOP
        BEGIN EXECUTE statement;
            RAISE EXCEPTION 'Anonymous identity access allowed: %',statement;
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
    END LOOP;
    RESET ROLE;
END;
$$;

ROLLBACK;
SELECT 'passed; identity/RLS changes and JWT settings rolled back' AS result;
