-- Milestone 4A: identity backend only. Review and obtain approval before applying.
-- Existing users/data are not backfilled or modified. No business-table grants.
BEGIN;

CREATE SCHEMA private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- The transaction creating an Auth user also creates its isolated organization.
-- Only bounded names come from editable metadata; identity/role/status never do.
CREATE FUNCTION private.provision_dealer_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    new_dealer_id uuid;
    account_name text := pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'display_name', 'Dealer'));
    business_name text := pg_catalog.btrim(COALESCE(NEW.raw_user_meta_data ->> 'business_name', 'Dealer organization'));
BEGIN
    IF (NEW.raw_user_meta_data ? 'display_name' AND
        pg_catalog.jsonb_typeof(NEW.raw_user_meta_data -> 'display_name') <> 'string')
       OR pg_catalog.char_length(account_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'display_name must be a nonblank string of at most 120 characters'
            USING ERRCODE = '22023';
    END IF;
    IF (NEW.raw_user_meta_data ? 'business_name' AND
        pg_catalog.jsonb_typeof(NEW.raw_user_meta_data -> 'business_name') <> 'string')
       OR pg_catalog.char_length(business_name) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'business_name must be a nonblank string of at most 160 characters'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dealers (name, is_active)
    VALUES (business_name, true)
    RETURNING id INTO new_dealer_id;

    INSERT INTO public.profiles (id, dealer_id, display_name, is_active)
    VALUES (NEW.id, new_dealer_id, account_name, true);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'dealer');

    RETURN NEW;
END;
$$;
ALTER FUNCTION private.provision_dealer_account() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.provision_dealer_account() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provision_dealer_account_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.provision_dealer_account();

-- Caller-bound helpers bypass table RLS only for these fixed identity lookups.
-- They accept no user/organization arguments and cannot recurse through policies.
CREATE FUNCTION private.is_active_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        JOIN public.user_roles AS r ON r.user_id = p.id
        WHERE p.id = (SELECT auth.uid()) AND p.is_active AND r.role = 'admin'
    );
$$;
ALTER FUNCTION private.is_active_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.is_active_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_admin() TO authenticated;

CREATE FUNCTION private.current_active_dealer_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.dealer_id
    FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.user_id = p.id AND r.role = 'dealer'
    JOIN public.dealers AS d ON d.id = p.dealer_id
    WHERE p.id = (SELECT auth.uid()) AND p.is_active AND d.is_active;
$$;
ALTER FUNCTION private.current_active_dealer_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.current_active_dealer_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_active_dealer_id() TO authenticated;

-- Own profile/role remain readable when inactive, for account-status feedback.
CREATE POLICY profiles_read_own ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

CREATE POLICY user_roles_read_own ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY dealers_read_active_own ON public.dealers
FOR SELECT TO authenticated
USING (id = (SELECT private.current_active_dealer_id()));

-- Column grants prevent editing membership, activation, IDs and timestamps.
CREATE POLICY profiles_update_own_display_name ON public.profiles
FOR UPDATE TO authenticated
USING (
    id = (SELECT auth.uid()) AND
    ((SELECT private.is_active_admin()) OR
     (SELECT private.current_active_dealer_id()) IS NOT NULL)
)
WITH CHECK (
    id = (SELECT auth.uid()) AND
    pg_catalog.char_length(display_name) BETWEEN 1 AND 120 AND
    ((SELECT private.is_active_admin()) OR
     (SELECT private.current_active_dealer_id()) IS NOT NULL)
);

GRANT SELECT ON public.profiles, public.user_roles, public.dealers TO authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;

-- No role-management RPC, admin-wide access, or grants/policies on products,
-- orders, order_items or Storage. Those belong to later approved milestones.
COMMIT;
