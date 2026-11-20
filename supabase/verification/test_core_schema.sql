-- Milestone 3B verification only: run after the approved migration.
-- Fixtures, helper, and temporary client grants are always rolled back.
-- No Auth identities are inserted or provisioned by this script.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE schema_check_results (test_name text PRIMARY KEY);

CREATE FUNCTION pg_temp.expect_rejection(
    test_name text, statement text, expected_state text,
    expected_constraint text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    actual_state text;
    actual_constraint text;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE,
                                actual_constraint = CONSTRAINT_NAME;
        IF actual_state <> expected_state OR
           (expected_constraint IS NOT NULL AND actual_constraint <> expected_constraint) THEN
            RAISE EXCEPTION '%: unexpected error % / %, expected % / %',
                test_name, actual_state, actual_constraint, expected_state, expected_constraint;
        END IF;
        INSERT INTO pg_temp.schema_check_results VALUES (test_name);
        RETURN;
    END;
    RAISE EXCEPTION '%: invalid statement unexpectedly succeeded', test_name;
END;
$$;

INSERT INTO public.dealers (id, name)
VALUES ('00000000-0000-4000-8000-000000003b01', 'Synthetic 3B organization');
INSERT INTO public.products (id, sku, name, unit_price) VALUES
('00000000-0000-4000-8000-000000003b02', 'DEMO-3B-ZERO', 'Synthetic free product', 0),
('00000000-0000-4000-8000-000000003b03', 'DEMO-3B-MAX', 'Synthetic maximum price', 9999999999.99);

SELECT pg_temp.expect_rejection('blank organization',
    $q$INSERT INTO public.dealers(name) VALUES (' ')$q$, '23514', 'dealers_name_nonblank');
SELECT pg_temp.expect_rejection('required organization name',
    $q$INSERT INTO public.dealers(name) VALUES (NULL)$q$, '23502');
SELECT pg_temp.expect_rejection('duplicate primary key',
    $q$INSERT INTO public.dealers(id,name) VALUES ('00000000-0000-4000-8000-000000003b01','Duplicate')$q$, '23505', 'dealers_pkey');
SELECT pg_temp.expect_rejection('negative price',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD','Test',-0.01)$q$, '23514', 'products_unit_price_valid');
SELECT pg_temp.expect_rejection('NaN price',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD','Test','NaN')$q$, '23514', 'products_unit_price_valid');
SELECT pg_temp.expect_rejection('infinite price',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD','Test','Infinity')$q$, '22003');
SELECT pg_temp.expect_rejection('price overflow',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD','Test',10000000000)$q$, '22003');
SELECT pg_temp.expect_rejection('required price',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD','Test',NULL)$q$, '23502');
SELECT pg_temp.expect_rejection('blank SKU',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES (' ','Test',1)$q$, '23514', 'products_sku_nonblank');
SELECT pg_temp.expect_rejection('blank product name',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('BAD',' ',1)$q$, '23514', 'products_name_nonblank');
SELECT pg_temp.expect_rejection('duplicate SKU',
    $q$INSERT INTO public.products(sku,name,unit_price) VALUES ('DEMO-3B-ZERO','Duplicate',1)$q$, '23505', 'products_sku_unique');
SELECT pg_temp.expect_rejection('blank profile name',
    $q$INSERT INTO public.profiles(id,display_name) VALUES ('00000000-0000-4000-8000-000000003b04',' ')$q$, '23514', 'profiles_display_name_nonblank');
SELECT pg_temp.expect_rejection('missing Auth user',
    $q$INSERT INTO public.profiles(id,display_name) VALUES ('00000000-0000-4000-8000-000000003b04','Synthetic')$q$, '23503', 'profiles_auth_user_fk');
SELECT pg_temp.expect_rejection('invalid role',
    $q$INSERT INTO public.user_roles(user_id,role) VALUES ('00000000-0000-4000-8000-000000003b04','owner')$q$, '23514', 'user_roles_role_allowed');
SELECT pg_temp.expect_rejection('missing role profile',
    $q$INSERT INTO public.user_roles(user_id) VALUES ('00000000-0000-4000-8000-000000003b04')$q$, '23503', 'user_roles_profile_fk');
SELECT pg_temp.expect_rejection('invalid order status',
    $q$INSERT INTO public.orders(dealer_id,created_by,request_id,status) VALUES ('00000000-0000-4000-8000-000000003b01','00000000-0000-4000-8000-000000003b04',gen_random_uuid(),'paid')$q$, '23514', 'orders_status_allowed');
SELECT pg_temp.expect_rejection('overlong order note',
    $q$INSERT INTO public.orders(dealer_id,created_by,request_id,note) VALUES ('00000000-0000-4000-8000-000000003b01','00000000-0000-4000-8000-000000003b04',gen_random_uuid(),repeat('x',2001))$q$, '23514', 'orders_note_length');
SELECT pg_temp.expect_rejection('missing order creator',
    $q$INSERT INTO public.orders(dealer_id,created_by,request_id) VALUES ('00000000-0000-4000-8000-000000003b01','00000000-0000-4000-8000-000000003b04',gen_random_uuid())$q$, '23503', 'orders_creator_fk');
SELECT pg_temp.expect_rejection('zero quantity',
    $q$INSERT INTO public.order_items VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000003b02',0,1,'DEMO','Test')$q$, '23514', 'order_items_quantity_positive');
SELECT pg_temp.expect_rejection('negative quantity',
    $q$INSERT INTO public.order_items VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000003b02',-1,1,'DEMO','Test')$q$, '23514', 'order_items_quantity_positive');
SELECT pg_temp.expect_rejection('negative snapshot price',
    $q$INSERT INTO public.order_items VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000003b02',1,-1,'DEMO','Test')$q$, '23514', 'order_items_unit_price_valid');
SELECT pg_temp.expect_rejection('NaN snapshot price',
    $q$INSERT INTO public.order_items VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000003b02',1,'NaN','DEMO','Test')$q$, '23514', 'order_items_unit_price_valid');
SELECT pg_temp.expect_rejection('missing parent order',
    $q$INSERT INTO public.order_items VALUES (gen_random_uuid(),'00000000-0000-4000-8000-000000003b02',1,1,'DEMO','Test')$q$, '23503', 'order_items_order_fk');

-- Require valid fixtures and database defaults before checking denied access.
DO $$
BEGIN
    IF (SELECT count(*) FROM pg_temp.schema_check_results) <> 23 THEN
        RAISE EXCEPTION 'Incomplete constraint verification';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE id='00000000-0000-4000-8000-000000003b01' AND is_active AND created_at IS NOT NULL)
       OR (SELECT count(*) FROM public.products WHERE id IN ('00000000-0000-4000-8000-000000003b02','00000000-0000-4000-8000-000000003b03') AND is_active AND description='' AND created_at IS NOT NULL) <> 2 THEN
        RAISE EXCEPTION 'Valid fixture/default verification failed';
    END IF;
END;
$$;

-- Test real denied statements, including self-promotion, ownership/status changes,
-- and price/snapshot edits. Permission denial must happen even on empty tables.
DO $$
DECLARE
    actor text;
    resource record;
    statement text;
    denied integer := 0;
BEGIN
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
        FOR resource IN SELECT * FROM (VALUES
            ('dealers', 'is_active = false'), ('profiles', 'dealer_id = gen_random_uuid()'),
            ('user_roles', $s$role = 'admin'$s$), ('products', 'unit_price = 0'),
            ('orders', $s$status = 'completed'$s$), ('order_items', 'unit_price_snapshot = 0')
        ) AS resources(table_name, assignment) LOOP
            FOREACH statement IN ARRAY ARRAY[
                format('SELECT * FROM public.%I', resource.table_name),
                format('INSERT INTO public.%I DEFAULT VALUES', resource.table_name),
                format('UPDATE public.%I SET %s', resource.table_name, resource.assignment),
                format('DELETE FROM public.%I', resource.table_name)
            ] LOOP
                EXECUTE format('SET LOCAL ROLE %I', actor);
                BEGIN
                    EXECUTE statement;
                    RAISE EXCEPTION 'Unexpected access for %: %', actor, statement;
                EXCEPTION WHEN insufficient_privilege THEN
                    denied := denied + 1;
                END;
                RESET ROLE;
            END LOOP;
        END LOOP;
    END LOOP;
    IF denied <> 48 THEN RAISE EXCEPTION 'Expected 48 privilege denials, got %', denied; END IF;
END;
$$;

-- Isolate RLS from table privileges. These grants never leave this transaction.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealers, public.profiles,
    public.user_roles, public.products, public.orders, public.order_items
TO anon, authenticated;

DO $$
DECLARE
    actor text;
    resource record;
    affected bigint;
    checked integer := 0;
BEGIN
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
        FOR resource IN SELECT * FROM (VALUES
            ('dealers', 'is_active = false', $s$(name) VALUES ('Synthetic forbidden')$s$),
            ('profiles', 'is_active = false', $s$(id,display_name) VALUES (gen_random_uuid(),'Synthetic forbidden')$s$),
            ('user_roles', $s$role = 'admin'$s$, $s$(user_id) VALUES (gen_random_uuid())$s$),
            ('products', 'unit_price = 0', $s$(sku,name,unit_price) VALUES ('DEMO-FORBIDDEN','Synthetic forbidden',1)$s$),
            ('orders', $s$status = 'completed'$s$, '(dealer_id,created_by,request_id) VALUES (gen_random_uuid(),gen_random_uuid(),gen_random_uuid())'),
            ('order_items', 'unit_price_snapshot = 0', $s$(order_id,product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot) VALUES (gen_random_uuid(),gen_random_uuid(),1,1,'DEMO','Synthetic forbidden')$s$)
        ) AS resources(table_name, assignment, insertion) LOOP
            EXECUTE format('SET LOCAL ROLE %I', actor);
            EXECUTE format('SELECT count(*) FROM public.%I', resource.table_name) INTO affected;
            IF affected <> 0 THEN RAISE EXCEPTION 'RLS leaked rows in %', resource.table_name; END IF;
            EXECUTE format('UPDATE public.%I SET %s', resource.table_name, resource.assignment);
            GET DIAGNOSTICS affected = ROW_COUNT;
            IF affected <> 0 THEN RAISE EXCEPTION 'RLS allowed UPDATE in %', resource.table_name; END IF;
            EXECUTE format('DELETE FROM public.%I', resource.table_name);
            GET DIAGNOSTICS affected = ROW_COUNT;
            IF affected <> 0 THEN RAISE EXCEPTION 'RLS allowed DELETE in %', resource.table_name; END IF;
            BEGIN
                EXECUTE format('INSERT INTO public.%I %s', resource.table_name, resource.insertion);
                RAISE EXCEPTION 'RLS allowed INSERT in %', resource.table_name;
            EXCEPTION WHEN insufficient_privilege THEN
                checked := checked + 4;
            END;
            RESET ROLE;
        END LOOP;
    END LOOP;
    IF checked <> 48 THEN RAISE EXCEPTION 'Expected 48 RLS checks, got %', checked; END IF;
END;
$$;

ROLLBACK;
SELECT 'passed; fixtures, helper and grants rolled back' AS result,
       23 AS constraint_rejections, 48 AS privilege_denials, 48 AS rls_checks;
