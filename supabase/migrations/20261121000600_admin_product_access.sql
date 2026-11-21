-- Milestone 8A: product management only. Obtain approval before applying.
-- Reuse existing product constraints and the caller-bound active-admin helper.
BEGIN;

CREATE POLICY products_read_active_admin ON public.products
FOR SELECT TO authenticated
USING ((SELECT private.is_active_admin()));

CREATE POLICY products_insert_active_admin ON public.products
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.is_active_admin()));

CREATE POLICY products_update_active_admin ON public.products
FOR UPDATE TO authenticated
USING ((SELECT private.is_active_admin()))
WITH CHECK ((SELECT private.is_active_admin()));

-- IDs and creation timestamps remain database-generated and client-immutable.
GRANT INSERT (sku, name, description, unit_price, is_active),
      UPDATE (sku, name, description, unit_price, is_active)
ON public.products TO authenticated;

-- Archive with is_active=false. No DELETE/TRUNCATE grant or DELETE policy.
-- Keep the active-dealer SELECT policy and all unrelated security/data intact.
COMMIT;
