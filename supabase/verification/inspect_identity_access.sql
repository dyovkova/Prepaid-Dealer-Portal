-- Read-only: safe before or after the 4A migration; no user data or credentials.
SELECT json_build_object(
    'private_schema', (SELECT json_build_object('name', nspname, 'acl', nspacl)
        FROM pg_catalog.pg_namespace WHERE nspname='private'),
    'functions', (SELECT json_agg(json_build_object(
        'name', p.proname, 'arguments', pg_catalog.pg_get_function_identity_arguments(p.oid),
        'owner', pg_catalog.pg_get_userbyid(p.proowner), 'definer', p.prosecdef,
        'config', p.proconfig, 'anon_execute', has_function_privilege('anon',p.oid,'EXECUTE'),
        'authenticated_execute', has_function_privilege('authenticated',p.oid,'EXECUTE')
    ) ORDER BY p.proname)
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='private'),
    'auth_triggers', (SELECT json_agg(json_build_object('name',tgname,
        'definition', pg_catalog.pg_get_triggerdef(oid)))
        FROM pg_catalog.pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal),
    'policies', (SELECT json_agg(json_build_object('table',tablename,'name',policyname,
        'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY tablename,policyname)
        FROM pg_catalog.pg_policies WHERE schemaname='public'),
    'profile_column_update', (SELECT json_agg(json_build_object('column',a.attname,
        'authenticated_update', has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE'))
        ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
        WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped),
    'table_privileges', (SELECT json_agg(json_build_object('table',c.relname,
        'role',r.role_name,'privilege',p.privilege,
        'granted',has_table_privilege(r.role_name::name,c.oid,p.privilege))
        ORDER BY c.relname,r.role_name,p.privilege)
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN (VALUES ('anon'),('authenticated')) r(role_name)
        CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
        WHERE n.nspname='public' AND c.relkind='r'),
    'history', (SELECT json_agg(json_build_object('version',version,'name',name) ORDER BY version)
        FROM supabase_migrations.schema_migrations)
) AS identity_inspection;
