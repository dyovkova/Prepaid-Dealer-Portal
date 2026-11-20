-- Read-only inspection after connecting to the verified, approved project.
-- Results are evidence to review, not a substitute for constraint/access tests.
-- Confirm the project reference through connection metadata first; database_name
-- alone does not distinguish Supabase projects.

SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version') AS postgres_version;

-- Preflight inventory: do not assume an uninspected remote project is empty.
SELECT c.relname AS relation_name, c.relkind AS relation_kind
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY c.relname;

-- Inspect existing DDL automation as well as tables; projects may enable automatic RLS.
SELECT n.nspname AS function_schema, p.proname AS function_name,
       p.prorettype::regtype AS return_type, p.proconfig,
       e.evtname AS event_trigger, e.evtenabled, e.evttags
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
LEFT JOIN pg_catalog.pg_event_trigger AS e ON e.evtfoid = p.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

SELECT n.nspname AS table_schema,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items')
ORDER BY c.relname;

SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name, con.conname AS constraint_name,
       con.contype AS constraint_type,
       pg_catalog.pg_get_constraintdef(con.oid) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items')
ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items')
ORDER BY tablename, indexname;

-- Expect zero policies and zero effective client table privileges in 3B.
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items');

SELECT c.relname AS table_name, r.role_name, p.privilege,
       has_table_privilege(r.role_name::name, c.oid, p.privilege) AS granted
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('dealers', 'profiles', 'user_roles', 'products', 'orders', 'order_items')
ORDER BY c.relname, r.role_name, p.privilege;

-- Check existence before separately reading migration history on this project.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_history_table;
-- If present, inspect: SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
