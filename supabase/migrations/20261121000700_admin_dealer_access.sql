-- Milestone 9A: organization administration and dealer-profile activation only.
-- Review and obtain approval before applying. No existing rows are changed.
BEGIN;

CREATE POLICY dealers_read_active_admin ON public.dealers
FOR SELECT TO authenticated USING ((SELECT private.is_active_admin()));

CREATE POLICY dealers_insert_active_admin ON public.dealers
FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_active_admin()));

CREATE POLICY dealers_update_active_admin ON public.dealers
FOR UPDATE TO authenticated
USING ((SELECT private.is_active_admin()))
WITH CHECK ((SELECT private.is_active_admin()));

CREATE POLICY profiles_read_active_admin ON public.profiles
FOR SELECT TO authenticated USING ((SELECT private.is_active_admin()));

CREATE POLICY user_roles_read_active_admin ON public.user_roles
FOR SELECT TO authenticated USING ((SELECT private.is_active_admin()));

-- Existing SELECT grants suffice. IDs/timestamps and all membership/role fields
-- remain client-immutable; profile is_active has no direct client UPDATE grant.
GRANT INSERT (name, is_active), UPDATE (name, is_active)
ON public.dealers TO authenticated;

CREATE FUNCTION private.set_dealer_profile_active(p_profile_id uuid, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    -- Hold the caller's identity rows until commit, then check current DB state.
    PERFORM 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE p.id = (SELECT auth.uid()) FOR SHARE OF p, r;
    IF NOT FOUND OR NOT private.is_active_admin() THEN
        RAISE EXCEPTION 'An active administrator is required' USING ERRCODE = '42501';
    END IF;
    IF p_profile_id IS NULL OR p_is_active IS NULL THEN
        RAISE EXCEPTION 'Supply a profile UUID and activation flag' USING ERRCODE = '22023';
    END IF;

    -- Same profile-before-role order as order creation. A pending order finishes
    -- before deactivation; later requests see the committed inactive flag.
    PERFORM 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
    WHERE p.id = p_profile_id AND p.dealer_id IS NOT NULL AND r.role = 'dealer'
    FOR UPDATE OF p FOR SHARE OF r;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'An existing dealer profile is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.profiles SET is_active = p_is_active WHERE id = p_profile_id;
    RETURN p_profile_id;
END;
$$;
ALTER FUNCTION private.set_dealer_profile_active(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.set_dealer_profile_active(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_dealer_profile_active(uuid, boolean) TO authenticated;

-- Public Data API entry point: no privileged implementation in an exposed schema.
CREATE FUNCTION public.set_dealer_profile_active(p_profile_id uuid, p_is_active boolean)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.set_dealer_profile_active(p_profile_id, p_is_active); $$;
ALTER FUNCTION public.set_dealer_profile_active(uuid, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_dealer_profile_active(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_dealer_profile_active(uuid, boolean) TO authenticated;

-- Preserve own-profile/role/name access and all product/order/Auth policies.
-- No DELETE/TRUNCATE grants, account provisioning, reassignment or role operation.
COMMIT;
