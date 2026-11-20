-- Run only on disposable local fixtures now; hosted execution needs approval.
-- Existing controlled dealer A/B/admin UUIDs must be provided through settings.
-- All orders, product/status edits, trigger fixtures and JWT settings roll back.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.fail_second_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF pg_catalog.current_setting('pdp.fail_second_item',true) = '1'
       AND EXISTS (SELECT 1 FROM public.order_items WHERE order_id=NEW.order_id) THEN
        RAISE EXCEPTION 'Injected second-item failure';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER test_fail_second_order_item BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_second_order_item();

DO $$
DECLARE
    a uuid := NULLIF(current_setting('pdp.order_dealer_a',true),'')::uuid;
    b uuid := NULLIF(current_setting('pdp.order_dealer_b',true),'')::uuid;
    admin_user uuid := NULLIF(current_setting('pdp.order_admin',true),'')::uuid;
    p1 uuid;
    p2 uuid;
    archived uuid;
    org uuid;
    request_key uuid := gen_random_uuid();
    submitted_id uuid;
    other_order uuid;
    payload jsonb;
    bad jsonb;
    actor uuid;
    statement text;
    resource text;
    initial_orders bigint := (SELECT count(*) FROM public.orders);
    initial_items bigint := (SELECT count(*) FROM public.order_items);
    invalid_count integer := 0;
    denials integer := 0;
BEGIN
    IF a IS NULL OR b IS NULL OR admin_user IS NULL OR a=b THEN
        RAISE EXCEPTION 'Supply verified synthetic dealer A/B/admin fixture UUIDs';
    END IF;
    SELECT dealer_id INTO STRICT org FROM public.profiles WHERE id=a AND is_active;
    IF (SELECT count(*) FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id
        JOIN public.dealers d ON d.id=p.dealer_id WHERE p.id IN (a,b) AND p.is_active AND d.is_active AND r.role='dealer') <> 2
       OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=admin_user AND role='admin') THEN
        RAISE EXCEPTION 'Unexpected fixture roles/status';
    END IF;
    SELECT id INTO STRICT p1 FROM public.products WHERE sku='PDP-DEMO-CREDIT-005' AND is_active;
    SELECT id INTO STRICT p2 FROM public.products WHERE sku='PDP-DEMO-DATA-005' AND is_active;
    SELECT id INTO STRICT archived FROM public.products WHERE sku='PDP-DEMO-LEGACY-001' AND NOT is_active;
    payload := jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',2),jsonb_build_object('product_id',p2,'quantity',3));
    PERFORM set_config('request.jwt.claim.sub',a::text,true);
    SET LOCAL ROLE authenticated;
    FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
        'null'::jsonb,'{}'::jsonb,'[]'::jsonb,'[null]'::jsonb,'[1]'::jsonb,
        jsonb_build_array(jsonb_build_object('product_id',p1)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity','2')),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',0)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',-1)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1.5)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',2147483648)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',null)),
        jsonb_build_array(jsonb_build_object('product_id','bad','quantity',1)),
        jsonb_build_array(jsonb_build_object('product_id',null,'quantity',1)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1,'unit_price',0)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1,'dealer_id',org)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1,'status','completed')),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1),jsonb_build_object('product_id',p1,'quantity',2)),
        jsonb_build_array(jsonb_build_object('product_id',archived,'quantity',1)),
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',1),jsonb_build_object('product_id',gen_random_uuid(),'quantity',1)),
        (SELECT jsonb_agg(jsonb_build_object('product_id',gen_random_uuid(),'quantity',1)) FROM generate_series(1,101))
    )) LOOP
        BEGIN
            PERFORM public.submit_order(gen_random_uuid(),bad);
            RAISE EXCEPTION 'Invalid payload accepted: %',bad;
        EXCEPTION WHEN invalid_parameter_value THEN invalid_count := invalid_count+1;
        END;
    END LOOP;
    BEGIN
        PERFORM public.submit_order(NULL,payload);
        RAISE EXCEPTION 'Null request ID accepted';
    EXCEPTION WHEN invalid_parameter_value THEN invalid_count := invalid_count+1;
    END;
    BEGIN
        PERFORM public.submit_order(gen_random_uuid(),payload,repeat('x',2001));
        RAISE EXCEPTION 'Long note accepted';
    EXCEPTION WHEN invalid_parameter_value THEN invalid_count := invalid_count+1;
    END;
    BEGIN
        PERFORM public.submit_order(gen_random_uuid(),NULL);
        RAISE EXCEPTION 'SQL NULL items accepted';
    EXCEPTION WHEN invalid_parameter_value THEN invalid_count := invalid_count+1;
    END;
    RESET ROLE;
    IF invalid_count <> 24 OR (SELECT count(*) FROM public.orders) <> initial_orders
       OR (SELECT count(*) FROM public.order_items) <> initial_items THEN
        RAISE EXCEPTION 'Invalid payload left partial writes or check count differs';
    END IF;

    PERFORM set_config('pdp.fail_second_item','1',true);
    SET LOCAL ROLE authenticated;
    BEGIN
        PERFORM public.submit_order(request_key,payload);
        RAISE EXCEPTION 'Second-item failure did not fire' USING ERRCODE='XX000';
    EXCEPTION WHEN raise_exception THEN NULL;
    END;
    RESET ROLE;
    PERFORM set_config('pdp.fail_second_item','0',true);
    IF (SELECT count(*) FROM public.orders) <> initial_orders OR (SELECT count(*) FROM public.order_items) <> initial_items THEN
        RAISE EXCEPTION 'Late persistence failure left partial header/items';
    END IF;

    SET LOCAL ROLE authenticated;
    submitted_id := public.submit_order(request_key,payload,'  Synthetic order note  ');
    IF public.submit_order(request_key,jsonb_build_array(payload->1,payload->0),'Synthetic order note') <> submitted_id THEN
        RAISE EXCEPTION 'Exact reordered retry duplicated order';
    END IF;
    FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
        jsonb_build_array(jsonb_build_object('product_id',p1,'quantity',3),payload->1),jsonb_build_array(payload->0)
    )) LOOP
        BEGIN
            PERFORM public.submit_order(request_key,bad,'Synthetic order note');
            RAISE EXCEPTION 'Conflicting retry accepted';
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
    END LOOP;
    BEGIN
        PERFORM public.submit_order(request_key,payload,'Different note');
        RAISE EXCEPTION 'Conflicting note accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id=submitted_id AND o.created_by=a AND o.dealer_id=org
        AND o.status='submitted' AND o.note='Synthetic order note' AND o.request_id=request_key)
       OR (SELECT count(*) FROM public.order_items i WHERE i.order_id=submitted_id) <> 2
       OR EXISTS (SELECT 1 FROM public.order_items i JOIN public.products p ON p.id=i.product_id
          WHERE i.order_id=submitted_id AND (i.unit_price_snapshot<>p.unit_price OR i.sku_snapshot<>p.sku OR i.name_snapshot<>p.name))
       OR (SELECT sum(i.quantity*i.unit_price_snapshot) FROM public.order_items i WHERE i.order_id=submitted_id) <> 30.25 THEN
        RAISE EXCEPTION 'Server ownership/status/note/snapshots/prices differ';
    END IF;
    UPDATE public.products SET name='Synthetic later name',sku='PDP-TEST-6A-RENAMED',unit_price=99.99,is_active=false WHERE id=p1;
    SET LOCAL ROLE authenticated;
    IF public.submit_order(request_key,payload,'Synthetic order note') <> submitted_id THEN RAISE EXCEPTION 'Retry lost original snapshot'; END IF;
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=submitted_id AND i.product_id=p1
        AND i.unit_price_snapshot=5 AND i.sku_snapshot='PDP-DEMO-CREDIT-005' AND i.name_snapshot='Demo Credit 5') THEN
        RAISE EXCEPTION 'Catalog edits changed historical snapshots';
    END IF;
    UPDATE public.profiles SET dealer_id=(SELECT dealer_id FROM public.profiles WHERE id=b) WHERE id=a;
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.submit_order(request_key,payload,'Synthetic order note'); RAISE EXCEPTION 'Changed membership replay accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    RESET ROLE;
    UPDATE public.profiles SET dealer_id=org WHERE id=a;
    SET LOCAL ROLE authenticated;
    other_order := public.submit_order(gen_random_uuid(),jsonb_build_array(
        jsonb_build_object('product_id',p2,'quantity',2147483647)),repeat('ü',2000));
    RESET ROLE;
    IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=other_order AND quantity=2147483647)
       OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id=other_order AND char_length(note)=2000) THEN
        RAISE EXCEPTION 'Valid integer/note boundaries rejected or altered';
    END IF;

    -- Same request UUID is scoped by creator, never another dealer's order.
    PERFORM set_config('request.jwt.claim.sub',b::text,true);
    SET LOCAL ROLE authenticated;
    other_order := public.submit_order(request_key,jsonb_build_array(payload->1));
    RESET ROLE;
    IF other_order=submitted_id OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id=other_order AND created_by=b) THEN
        RAISE EXCEPTION 'Cross-account request key collision leaked/reused order';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',a::text,true);
    UPDATE public.profiles SET is_active=false WHERE id=a;
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.submit_order(request_key,payload,'Synthetic order note'); RAISE EXCEPTION 'Inactive replay allowed';
    EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    RESET ROLE;
    UPDATE public.profiles SET is_active=true WHERE id=a;
    UPDATE public.dealers SET is_active=false WHERE id=org;
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.submit_order(gen_random_uuid(),payload); RAISE EXCEPTION 'Inactive organization allowed';
    EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    RESET ROLE;
    UPDATE public.dealers SET is_active=true WHERE id=org;
    DELETE FROM public.user_roles WHERE user_id=a;
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.submit_order(gen_random_uuid(),payload); RAISE EXCEPTION 'Missing role allowed';
    EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    RESET ROLE;
    INSERT INTO public.user_roles(user_id,role) VALUES (a,'dealer');
    UPDATE public.profiles SET dealer_id=NULL WHERE id=a;
    SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.submit_order(gen_random_uuid(),payload); RAISE EXCEPTION 'Missing membership allowed';
    EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    RESET ROLE;
    UPDATE public.profiles SET dealer_id=org WHERE id=a;

    FOREACH actor IN ARRAY ARRAY[admin_user,gen_random_uuid(),NULL::uuid] LOOP
        PERFORM set_config('request.jwt.claim.sub',COALESCE(actor::text,''),true);
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'user_metadata',jsonb_build_object('role','dealer','is_active',true))::text,true);
        SET LOCAL ROLE authenticated;
        BEGIN PERFORM public.submit_order(gen_random_uuid(),payload); RAISE EXCEPTION 'Unauthorized actor accepted';
        EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
        RESET ROLE;
    END LOOP;
    SET LOCAL ROLE anon;
    BEGIN PERFORM public.submit_order(request_key,payload); RAISE EXCEPTION 'Anonymous RPC allowed';
    EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub',a::text,true);
    SET LOCAL ROLE authenticated;
    FOREACH statement IN ARRAY ARRAY[
        'SELECT private.validate_order_items(''[]''::jsonb)', 'SELECT private.lock_order_dealer()',
        'SELECT private.lock_order_products(''[]''::jsonb)'
    ] LOOP
        BEGIN EXECUTE statement; RAISE EXCEPTION 'Private helper callable';
        EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
    END LOOP;
    RESET ROLE;
    FOREACH resource IN ARRAY ARRAY['orders','order_items'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||resource)::regclass)
           OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=resource) THEN
            RAISE EXCEPTION 'Order tables must retain default-deny RLS';
        END IF;
        SET LOCAL ROLE authenticated;
        FOREACH statement IN ARRAY ARRAY['SELECT * FROM public.'||resource,
            'INSERT INTO public.'||resource||' DEFAULT VALUES','UPDATE public.'||resource||' SET '||
            CASE resource WHEN 'orders' THEN 'status=''completed''' ELSE 'quantity=1' END,
            'DELETE FROM public.'||resource,'TRUNCATE public.'||resource] LOOP
            BEGIN EXECUTE statement; RAISE EXCEPTION 'Direct table access allowed';
            EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
        END LOOP;
        RESET ROLE;
    END LOOP;
    IF denials <> 21 THEN RAISE EXCEPTION 'Expected 21 authorization/helper/table denials, got %',denials; END IF;
END;
$$;
ROLLBACK;
SELECT 'passed; atomic order fixtures and all edits rolled back' AS result;
