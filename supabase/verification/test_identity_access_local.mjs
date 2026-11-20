// Disposable PostgreSQL simulation; this does NOT run Supabase Auth or HTTP signup.
// The minimal auth schema below contains no passwords, sessions, or real identities.
// No remote connection, credentials, or application dependency is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(new URL(
  '../../.verification/identity-sql-tools/node_modules/@electric-sql/pglite/dist/index.js',
  import.meta.url,
));
const db = new PGlite();
const readSql = (name) => readFile(new URL(name, import.meta.url), 'utf8');
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const userA = '00000000-0000-4000-8000-000000004a01';
const userB = '00000000-0000-4000-8000-000000004a02';
const counts = () => one(`SELECT
  (SELECT count(*)::int FROM auth.users) AS events,
  (SELECT count(*)::int FROM public.dealers) AS dealers,
  (SELECT count(*)::int FROM public.profiles) AS profiles,
  (SELECT count(*)::int FROM public.user_roles) AS roles`);
// This inserts only into the in-memory Auth event stub, never a Supabase project.
const authEvent = (id, email, metadata) => db.query(
  'INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',
  [id, email, metadata],
);

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE,
      raw_user_meta_data jsonb, email_confirmed_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    GRANT INSERT ON auth.users TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
  `);
  await db.exec(await readSql('../migrations/20261120000100_core_schema.sql'));
  await db.exec(await readSql('../migrations/20261120000200_identity_and_access.sql'));
  // Simulate the Auth service's restricted database role, not the migration owner.
  await db.exec('SET ROLE supabase_auth_admin');
  await authEvent(userA, 'demo-4a-a@example.invalid', {
    test_fixture: 'milestone4a', display_name: 'Dealer A', business_name: 'Same business name',
  });
  await db.exec('RESET ROLE');
  const orgA = (await one('SELECT dealer_id FROM public.profiles WHERE id=$1', [userA])).dealer_id;
  await db.exec('SET ROLE supabase_auth_admin');
  await authEvent(userB, 'demo-4a-b@example.invalid', {
    test_fixture: 'milestone4a', display_name: 'Dealer B', business_name: 'Same business name',
    role: 'admin', dealer_id: orgA, id: userA, user_id: userA, is_active: false,
  });
  await db.exec('RESET ROLE');
  const beforeTests = await counts();
  const results = await db.exec(await readSql('test_identity_access.sql'));
  assert.equal(results.at(-1).rows[0].result, 'passed; identity/RLS changes and JWT settings rolled back');
  assert.deepEqual(await counts(), beforeTests);
  assert.equal((await one('SELECT role FROM public.user_roles WHERE user_id=$1', [userA])).role, 'dealer');
  assert.equal((await one('SELECT display_name FROM public.profiles WHERE id=$1', [userA])).display_name, 'Dealer A');

  // Later edits to user-controlled Auth metadata also cannot change authorization.
  await db.query('UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2',
    [{ role: 'admin', dealer_id: crypto.randomUUID(), is_active: true }, userA]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [userA]);
  await db.exec('SET ROLE authenticated');
  assert.deepEqual(await one('SELECT private.is_active_admin() AS admin, private.current_active_dealer_id() AS dealer'),
    { admin: false, dealer: orgA });
  await db.exec('RESET ROLE');

  let invalidMetadataChecks = 0;
  for (const metadata of [
    { display_name: '' }, { display_name: ' ' }, { display_name: 'x'.repeat(121) },
    { display_name: { role: 'admin' } }, { display_name: null },
    { business_name: '' }, { business_name: 'x'.repeat(161) }, { business_name: ['organization'] },
  ]) {
    await db.exec('SET ROLE supabase_auth_admin');
    await assert.rejects(authEvent(crypto.randomUUID(), `${crypto.randomUUID()}@example.invalid`, metadata),
      (error) => error.code === '22023');
    await db.exec('RESET ROLE');
    assert.deepEqual(await counts(), beforeTests, 'Rejected signup left partial rows');
    invalidMetadataChecks++;
  }
  const fallbackUser = crypto.randomUUID();
  await authEvent(fallbackUser, 'demo-4a-defaults@example.invalid', {});
  assert.equal((await one('SELECT display_name FROM public.profiles WHERE id=$1', [fallbackUser])).display_name, 'Dealer');

  // Force failure after the organization/profile inserts to verify full rollback.
  const beforeFailure = await counts();
  await db.exec(`BEGIN;
    CREATE FUNCTION pg_temp.reject_test_role() RETURNS trigger LANGUAGE plpgsql AS
      $$BEGIN RAISE EXCEPTION 'Synthetic late provisioning failure'; END$$;
    CREATE TRIGGER reject_test_role BEFORE INSERT ON public.user_roles
      FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_role();
    SAVEPOINT before_auth_event;`);
  await assert.rejects(authEvent(crypto.randomUUID(), 'demo-4a-failure@example.invalid', {}),
    (error) => error.code === 'P0001');
  await db.exec('ROLLBACK TO SAVEPOINT before_auth_event');
  assert.deepEqual(await counts(), beforeFailure, 'Late trigger failure left partial rows');
  await db.exec('ROLLBACK');

  const security = await one(`SELECT
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='public') AS policies,
    has_function_privilege('authenticated','private.provision_dealer_account()','EXECUTE') AS trigger_callable,
    has_schema_privilege('authenticated','private','CREATE') AS private_writable,
    has_column_privilege('authenticated','public.profiles','display_name','UPDATE') AS name_editable,
    has_column_privilege('authenticated','public.profiles','dealer_id','UPDATE') AS membership_editable`);
  assert.deepEqual(security, {
    policies: 4, trigger_callable: false, private_writable: false,
    name_editable: true, membership_editable: false,
  });
  const adminGuide = await readSql('../identity-access.md');
  const adminProcedure = adminGuide.match(/```sql\n([\s\S]*?)```/)[1];
  await assert.rejects(db.exec(adminProcedure), (error) => error.code === 'P0001');
  await db.exec('ROLLBACK');
  await db.exec(adminProcedure
    .replace("target_user uuid := '00000000-0000-0000-0000-000000000000'", `target_user uuid := '${userA}'`)
    .replace('demo-admin@example.invalid', 'demo-4a-a@example.invalid'));
  assert.equal((await one('SELECT role FROM public.user_roles WHERE user_id=$1', [userA])).role, 'admin');
  await assert.rejects(db.exec(adminProcedure
    .replace("target_user uuid := '00000000-0000-0000-0000-000000000000'", `target_user uuid := '${userB}'`)
    .replace('demo-admin@example.invalid', 'demo-4a-b@example.invalid')), (error) => error.code === 'P0001');
  await db.exec('ROLLBACK');
  assert.equal((await one('SELECT role FROM public.user_roles WHERE user_id=$1', [userB])).role, 'dealer');
  console.log(JSON.stringify({
    database: (await one('SELECT version()')).version,
    result: 'passed local SQL/trigger/RLS simulation', invalidMetadataChecks,
    checks: ['isolated signup events', 'ignored forged metadata', 'late failure atomicity',
      'own-row reads/updates', 'cross-account denials', 'column protection', 'inactive/stale claims',
      'admin and missing-role restrictions', 'no RLS recursion', 'deferred business access denied',
      'test transaction rollback', 'trusted demo-admin procedure and guards'],
    limitation: 'This local simulation does not validate real Supabase Auth signup or JWT sessions.',
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message,
    detail: error.detail, where: error.where, position: error.position,
    internalQuery: error.internalQuery }, null, 2));
  process.exitCode = 1;
} finally {
  await db.close();
}
