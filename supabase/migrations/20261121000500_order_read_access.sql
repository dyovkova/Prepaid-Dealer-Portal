-- Milestone 7A: dealer organization history reads only. Approval required remotely.
-- Reuse the caller-bound database role/profile/organization status helper.
BEGIN;

CREATE POLICY orders_read_active_organization ON public.orders
FOR SELECT TO authenticated
USING (dealer_id = (SELECT private.current_active_dealer_id()));

-- Parent lookup runs under orders RLS. No product join: archived/renamed products
-- must not hide or replace the saved SKU/name/price snapshots.
CREATE POLICY order_items_read_visible_order ON public.order_items
FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.orders AS o
    WHERE o.id = order_items.order_id
));

GRANT SELECT ON public.orders, public.order_items TO authenticated;

-- Existing RLS stays enabled. No anonymous grants, write grants/policies,
-- admin-wide access, RPC changes or data modifications.
COMMIT;
