-- Corrective follow-up to 10A. NOT approved for remote deployment.
-- PostgREST 14 retries 40001; a stale business expectation must return HTTP 409.
-- Preserve the existing private function owner, ACLs, locks and public wrapper.
BEGIN;

CREATE OR REPLACE FUNCTION private.transition_order_status(
    p_order_id uuid, p_expected_status text, p_new_status text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    current_status text;
BEGIN
    -- Hold current authority through commit; recheck after any identity lock wait.
    PERFORM 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE p.id = (SELECT auth.uid()) FOR SHARE OF p, r;
    IF NOT FOUND OR NOT private.is_active_admin() THEN
        RAISE EXCEPTION 'An active administrator is required' USING ERRCODE = '42501';
    END IF;
    IF p_order_id IS NULL OR p_expected_status IS NULL OR p_new_status IS NULL
       OR p_expected_status NOT IN ('submitted', 'processing', 'completed', 'rejected')
       OR p_new_status NOT IN ('submitted', 'processing', 'completed', 'rejected') THEN
        RAISE EXCEPTION 'Supply an order UUID and valid expected/new statuses' USING ERRCODE = '22023';
    END IF;

    SELECT o.status INTO current_status FROM public.orders o
    WHERE o.id = p_order_id FOR UPDATE OF o;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An existing order is required' USING ERRCODE = '22023';
    END IF;
    IF current_status <> p_expected_status THEN
        RAISE EXCEPTION 'Order status changed; reload before retrying' USING ERRCODE = 'PT409';
    END IF;
    IF NOT ((current_status = 'submitted' AND p_new_status IN ('processing', 'rejected'))
        OR (current_status = 'processing' AND p_new_status IN ('completed', 'rejected'))) THEN
        RAISE EXCEPTION 'Order status transition is not permitted' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders SET status = p_new_status, updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_order_id;
    RETURN p_order_id;
END;
$$;
COMMIT;
