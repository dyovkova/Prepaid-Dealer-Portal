// Shared LOCAL test setup. The Auth table is an event stub, not Supabase Auth.
import { readFile } from 'node:fs/promises';
export const fixture = {
  a: '00000000-0000-4000-8000-000000006a01',
  b: '00000000-0000-4000-8000-000000006a02',
  admin: '00000000-0000-4000-8000-000000006a03',
};
export const sqlFile = name => readFile(new URL(name, import.meta.url), 'utf8');
export async function setupOrderTests(db) {
  await db.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE supabase_auth_admin;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_user_meta_data jsonb,
      email_confirmed_at timestamptz DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,supabase_auth_admin;
    GRANT INSERT ON auth.users TO supabase_auth_admin;`);
  for (const migration of ['20261120000100_core_schema.sql','20261120000200_identity_and_access.sql',
    '20261120000300_catalog_access.sql','20261120000400_atomic_order_requests.sql']) {
    await db.query(await sqlFile(`../migrations/${migration}`));
  }
  await db.query(await sqlFile('../seeds/demo_products.sql'));
  await db.query('SET ROLE supabase_auth_admin');
  for (const [name,id] of Object.entries(fixture)) {
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',
      [id,`order-${name}@example.invalid`,{display_name:`Synthetic order ${name}`,business_name:'Synthetic order organization'}]);
  }
  await db.query('RESET ROLE');
  await db.query("UPDATE public.user_roles SET role='admin' WHERE user_id=$1",[fixture.admin]);
  await db.query(`SELECT set_config('pdp.order_dealer_a',$1,false),set_config('pdp.order_dealer_b',$2,false),
    set_config('pdp.order_admin',$3,false),set_config('pdp.catalog_dealer_id',$1,false),set_config('pdp.catalog_admin_id',$3,false)`,
  [fixture.a,fixture.b,fixture.admin]);
  return (await db.query('SELECT * FROM public.products ORDER BY sku')).rows;
}
export async function asDealer(db, subject=fixture.a) {
  await db.query('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [subject,JSON.stringify({sub:subject,role:'authenticated',user_metadata:{role:'dealer',is_active:true}})]);
  await db.query('SET ROLE authenticated');
}
export const submit = async (db,requestId,items,note=null) =>
  (await db.query('SELECT public.submit_order($1::uuid,$2::jsonb,$3::text) AS id',
    [requestId,JSON.stringify(items),note])).rows[0].id;
