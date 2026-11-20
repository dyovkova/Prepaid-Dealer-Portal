// Disposable PostgreSQL simulation only: no remote SQL, real Auth or credentials.
// Reuses the optional local PGlite installation documented for 4A.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(new URL(
  '../../.verification/identity-sql-tools/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url,
));
const db = new PGlite();
const sql = path => readFile(new URL(path, import.meta.url), 'utf8');
const rows = async statement => (await db.query(statement)).rows;
const dealer = '00000000-0000-4000-8000-000000005a01';
const admin = '00000000-0000-4000-8000-000000005a02';
const identity = () => rows(`SELECT p.id,p.dealer_id,p.display_name,p.is_active,d.is_active AS organization_active,r.role
  FROM public.profiles p JOIN public.dealers d ON d.id=p.dealer_id JOIN public.user_roles r ON r.user_id=p.id ORDER BY p.id`);

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE,raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,supabase_auth_admin;
    GRANT INSERT ON auth.users TO supabase_auth_admin;`);
  await db.exec(await sql('../migrations/20261120000100_core_schema.sql'));
  await db.exec(await sql('../migrations/20261120000200_identity_and_access.sql'));
  // Minimal in-memory event stub, not direct inserts into hosted Supabase Auth.
  await db.exec('SET ROLE supabase_auth_admin');
  for (const [id, name] of [[dealer,'Synthetic catalog dealer'],[admin,'Synthetic catalog admin']]) {
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',
      [id, `${id}@example.invalid`, { display_name: name, business_name: 'Synthetic catalog simulation' }]);
  }
  await db.exec('RESET ROLE');
  // Trusted fixture setup is confined to this disposable database, never hosted.
  await db.query("UPDATE public.user_roles SET role='admin' WHERE user_id=$1", [admin]);
  const identitiesBefore = await identity();
  await db.exec(await sql('../migrations/20261120000300_catalog_access.sql'));
  const seed = await sql('../seeds/demo_products.sql');
  await db.exec(seed);
  const productsBefore = await rows('SELECT * FROM public.products ORDER BY sku');
  assert.equal(productsBefore.length, 12);
  assert.equal(productsBefore.filter(p => p.is_active).length, 10);
  assert.equal(productsBefore.filter(p => !p.is_active).length, 2);
  assert.equal(new Set(productsBefore.map(p => p.sku)).size, 12);
  assert.ok(productsBefore.every(p => p.sku.startsWith('PDP-DEMO-') && Number(p.unit_price) > 0));
  await db.exec(seed);
  assert.deepEqual(await rows('SELECT * FROM public.products ORDER BY sku'), productsBefore, 'Repeat seed preserves IDs, timestamps and values');
  console.log('PASS three migrations; 12 fictional products (10 active/2 inactive); seed rerun is an exact no-op');

  await db.query("SELECT set_config('pdp.catalog_dealer_id',$1,false),set_config('pdp.catalog_admin_id',$2,false)", [dealer,admin]);
  const outcome = await db.exec(await sql('test_catalog_access.sql'));
  assert.equal(outcome.at(-1).rows[0].result, 'passed; catalog/status fixtures and JWT settings rolled back');
  assert.deepEqual(await rows('SELECT * FROM public.products ORDER BY sku'), productsBefore);
  assert.deepEqual(await identity(), identitiesBefore);
  assert.equal((await rows("SELECT count(*)::int AS n FROM public.orders"))[0].n, 0);
  assert.equal((await rows("SELECT count(*)::int AS n FROM public.order_items"))[0].n, 0);
  console.log('PASS active/archived reads; inactive profile/organization with unchanged claims; restored access; admin/missing-identity denial; 22 forbidden statements; complete fixture rollback');

  await db.exec(`BEGIN;
    UPDATE public.products SET unit_price=9.99,is_active=false WHERE sku='PDP-DEMO-CREDIT-005';
    INSERT INTO public.products(sku,name,description,unit_price) VALUES ('PDP-OTHER-SYNTHETIC','Other synthetic product','Preservation check',1.10);
    COMMIT;`);
  const edited = await rows('SELECT * FROM public.products ORDER BY sku');
  await db.exec(seed);
  assert.deepEqual(await rows('SELECT * FROM public.products ORDER BY sku'), edited);
  assert.deepEqual(await identity(), identitiesBefore);
  console.log('PASS seed preserves an edited matching SKU, unrelated products and identity data');
  const grants = await rows(`SELECT r,
    has_table_privilege(r,'public.products','SELECT') AS can_read,
    has_table_privilege(r,'public.products','INSERT') AS can_insert,
    has_table_privilege(r,'public.products','UPDATE') AS can_update,
    has_table_privilege(r,'public.products','DELETE') AS can_delete,
    has_table_privilege(r,'public.products','TRUNCATE') AS can_truncate
    FROM unnest(ARRAY['anon','authenticated']) r ORDER BY r`);
  assert.deepEqual(grants, [
    { r: 'anon', can_read: false, can_insert: false, can_update: false, can_delete: false, can_truncate: false },
    { r: 'authenticated', can_read: true, can_insert: false, can_update: false, can_delete: false, can_truncate: false },
  ]);
  console.log('PASS final product grants remain SELECT-only for authenticated and absent for anon');
} finally {
  await db.close();
}
