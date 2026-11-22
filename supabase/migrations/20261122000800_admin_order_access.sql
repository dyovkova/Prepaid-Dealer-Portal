-- Milestone 10A: admin order reads and guarded status transitions only.
-- Review and obtain approval before applying remotely. No existing rows change.
BEGIN;

CREATE POLICY orders_read_active_admin ON public.orders
FOR SELECT TO authenticated USING ((SELECT private.is_active_admin()));

-- Existing SELECT grants and parent-order item policy cover admin item reads.
-- No direct write grants/policies, snapshot changes or submission RPC changes.
CREATE FUNCTION private.transition_order_status(
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
        RAISE EXCEPTION 'Order status changed; reload before retrying' USING ERRCODE = '40001';
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
ALTER FUNCTION private.transition_order_status(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.transition_order_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.transition_order_status(uuid, text, text) TO authenticated;

CREATE FUNCTION public.transition_order_status(
    p_order_id uuid, p_expected_status text, p_new_status text
)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.transition_order_status(p_order_id, p_expected_status, p_new_status); $$;
ALTER FUNCTION public.transition_order_status(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transition_order_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, text) TO authenticated;

COMMIT;
