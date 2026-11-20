-- Milestone 5A: dealer catalog reads only. Obtain approval before applying.
-- Existing helper checks the database role, profile and organization status.
BEGIN;

CREATE POLICY products_read_active_dealer ON public.products
FOR SELECT TO authenticated
USING (is_active AND (SELECT private.current_active_dealer_id()) IS NOT NULL);

GRANT SELECT ON public.products TO authenticated;

-- No anonymous access, product writes, admin policy, orders or Storage access.
COMMIT;
