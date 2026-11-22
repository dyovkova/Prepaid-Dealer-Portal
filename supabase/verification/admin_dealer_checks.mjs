// LOCAL synthetic PostgreSQL fixtures only. No hosted connections or Auth API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asDealer,fixture,submit } from './order_test_support.mjs';

export const member = '00000000-0000-4000-8000-000000009a01';
export const activate = async (db,id,active) => (await db.query(
  'SELECT public.set_dealer_profile_active($1::uuid,$2::boolean) AS id',[id,active])).rows[0].id;
async function denied(db,sql,args=[],code='42501') {
  await db.query('SAVEPOINT denied_operation');
  await assert.rejects(db.query(sql,args),{code});
  await db.query('ROLLBACK TO SAVEPOINT denied_operation');await db.query('RELEASE SAVEPOINT denied_operation');
}
async function noOrganizationWrites(db,id) {
  await denied(db,"INSERT INTO public.dealers(name) VALUES ('Unauthorized synthetic organization')");
  for(const change of ["name='Unauthorized'",'is_active=false'])assert.equal((await db.query(`UPDATE public.dealers SET ${change} WHERE id=$1`,[id])).rowCount,0);
  await denied(db,'DELETE FROM public.dealers');await denied(db,'TRUNCATE public.dealers');
}
async function business(db,actor,allowed,baseline,products) {
  await asDealer(db,actor);
  assert.equal((await db.query('SELECT * FROM public.products')).rowCount,allowed?products.filter(p=>p.is_active).length:0);
  const org=baseline.profiles.find(p=>p.id===actor).dealer_id;
  assert.equal((await db.query('SELECT * FROM public.dealers')).rowCount,allowed?1:0);
  const visible=allowed?baseline.orders.filter(o=>o.dealer_id===org):[];
  assert.deepEqual((await db.query('SELECT * FROM public.orders ORDER BY id')).rows,visible);
  assert.deepEqual((await db.query('SELECT * FROM public.order_items ORDER BY order_id,product_id')).rows,
    baseline.items.filter(i=>visible.some(o=>o.id===i.order_id)));
  assert.equal((await db.query('SELECT * FROM public.profiles')).rowCount,1);
  assert.equal((await db.query('SELECT * FROM public.user_roles')).rowCount,1);
  if(!allowed){
    await denied(db,'SELECT public.submit_order($1::uuid,$2::jsonb)',[randomUUID(),JSON.stringify([{product_id:products[0].id,quantity:1}])]);
    const own=baseline.orders.find(o=>o.created_by===actor);
    if(own)await denied(db,'SELECT public.submit_order($1::uuid,$2::jsonb)',[own.request_id,'[]']);
    assert.equal((await db.query('UPDATE public.profiles SET display_name=display_name WHERE id=$1',[actor])).rowCount,0);
  }
}
async function organizations(db,baseline) {
  await asDealer(db,fixture.admin);
  assert.equal((await db.query('SELECT * FROM public.dealers')).rowCount,baseline.dealers.length);
  assert.equal((await db.query('SELECT * FROM public.profiles')).rowCount,baseline.profiles.length);
  assert.equal((await db.query('SELECT * FROM public.user_roles')).rowCount,baseline.roles.length);
  assert.equal((await db.query('SELECT p.id FROM public.dealers d JOIN public.profiles p ON p.dealer_id=d.id JOIN public.user_roles r ON r.user_id=p.id')).rowCount,baseline.profiles.length);
  const created=(await db.query("INSERT INTO public.dealers(name) VALUES ('Synthetic 9A empty organization') RETURNING *")).rows[0];
  assert.ok(created.id&&created.created_at&&created.is_active);
  assert.equal((await db.query('SELECT * FROM public.profiles WHERE dealer_id=$1',[created.id])).rowCount,0);
  assert.equal((await db.query("UPDATE public.dealers SET name='Synthetic renamed organization',is_active=false WHERE id=$1 RETURNING *",[created.id])).rows[0].is_active,false);
  assert.equal((await db.query('SELECT * FROM public.dealers WHERE id=$1 AND NOT is_active',[created.id])).rowCount,1);
  for(const [sql,args,code]of [
    ['INSERT INTO public.dealers(name) VALUES ($1)',[null],'23502'],
    ['INSERT INTO public.dealers(name) VALUES ($1)',['   '],'23514'],
    ['UPDATE public.dealers SET name=$1 WHERE id=$2',['',created.id],'23514'],
    ['UPDATE public.dealers SET is_active=NULL WHERE id=$1',[created.id],'23502'],
    ["INSERT INTO public.dealers(id,name) VALUES (gen_random_uuid(),'Forbidden ID')",[],'42501'],
    ["INSERT INTO public.dealers(created_at,name) VALUES (now(),'Forbidden timestamp')",[],'42501'],
    ['UPDATE public.dealers SET id=gen_random_uuid()',[],'42501'],
    ['UPDATE public.dealers SET created_at=now()',[],'42501'],
    ['DELETE FROM public.dealers WHERE id=$1',[created.id],'42501'],
  ])await denied(db,sql,args,code);
  console.log('PASS admin organization/profile/role lists and joins, empty-org creation, rename/deactivation, validation and immutable columns; no hard deletion');
}
async function authorization(db,baseline) {
  const org=baseline.profiles.find(p=>p.id===fixture.a).dealer_id;
  for(const actor of [fixture.a,fixture.b,randomUUID(),'']) {
    await asDealer(db,actor);
    await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,user_metadata:{role:'admin',is_active:true}})]);
    await noOrganizationWrites(db,org);
    await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.a]);
    await denied(db,'SELECT private.set_dealer_profile_active($1,false)',[fixture.a]);
    assert.equal((await db.query('SELECT * FROM public.profiles WHERE id=$1',[fixture.admin])).rowCount,0);
  }
  await db.query('RESET ROLE');await db.query('SET ROLE anon');
  for(const table of ['dealers','profiles','user_roles'])await denied(db,`SELECT * FROM public.${table}`);
  await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.a]);
  await denied(db,'SELECT private.set_dealer_profile_active($1,false)',[fixture.a]);
  await asDealer(db,fixture.admin);
  for(const args of [[null,true],[fixture.a,null],[fixture.admin,false],[randomUUID(),false]])
    await denied(db,'SELECT public.set_dealer_profile_active($1::uuid,$2::boolean)',args,'22023');
  const otherOrg=baseline.profiles.find(p=>p.id===fixture.b).dealer_id;
  await db.query('RESET ROLE');await db.query('UPDATE public.profiles SET dealer_id=NULL WHERE id=$1',[fixture.b]);
  await asDealer(db,fixture.admin);await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.b],'22023');
  await db.query('RESET ROLE');await db.query('UPDATE public.profiles SET dealer_id=$1 WHERE id=$2',[otherOrg,fixture.b]);
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[fixture.b]);
  await asDealer(db,fixture.admin);await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.b],'22023');
  await db.query('RESET ROLE');await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'dealer')",[fixture.b]);
  for(const actor of [fixture.a,fixture.admin]) {
    await asDealer(db,actor);
    for(const sql of ['UPDATE public.profiles SET is_active=true','UPDATE public.profiles SET dealer_id=NULL',
      'UPDATE public.profiles SET id=gen_random_uuid()','UPDATE public.profiles SET created_at=now()',
      "INSERT INTO public.user_roles(user_id,role) VALUES (gen_random_uuid(),'admin')",
      "UPDATE public.user_roles SET role='admin'",'DELETE FROM public.user_roles','DELETE FROM public.profiles'])await denied(db,sql);
    const other=actor===fixture.a?fixture.b:fixture.a;
    assert.equal((await db.query("UPDATE public.profiles SET display_name='Unauthorized' WHERE id=$1",[other])).rowCount,0);
  }
  await db.query('RESET ROLE');await db.query('SAVEPOINT delete_defense');
  await db.query('GRANT DELETE ON public.dealers,public.profiles,public.user_roles TO authenticated');
  await asDealer(db,fixture.admin);
  for(const table of ['dealers','profiles','user_roles'])assert.equal((await db.query(`DELETE FROM public.${table}`)).rowCount,0);
  await db.query('RESET ROLE');await db.query('ROLLBACK TO SAVEPOINT delete_defense');
  console.log('PASS dealer/missing/anonymous/forged-metadata RPC and organization denials; admin target protected; direct activation/membership/role/identity writes and DELETE RLS denied');
}
async function activation(db,baseline,products) {
  const org=baseline.profiles.find(p=>p.id===fixture.a).dealer_id;
  await asDealer(db,fixture.admin);assert.equal(await activate(db,fixture.a,false),fixture.a);
  await business(db,fixture.a,false,baseline,products);await business(db,member,true,baseline,products);
  await asDealer(db,fixture.admin);assert.equal(await activate(db,fixture.a,true),fixture.a);
  await business(db,fixture.a,true,baseline,products);
  await asDealer(db,fixture.admin);await db.query('UPDATE public.dealers SET is_active=false WHERE id=$1',[org]);
  await activate(db,fixture.a,false);await activate(db,fixture.a,true); // Cannot bypass an inactive organization.
  for(const actor of [fixture.a,member]){await business(db,actor,false,baseline,products);await noOrganizationWrites(db,org);}
  await asDealer(db,fixture.admin);await db.query('UPDATE public.dealers SET is_active=true WHERE id=$1',[org]);
  for(const actor of [fixture.a,member])await business(db,actor,true,baseline,products);
  await asDealer(db,fixture.a);
  assert.equal((await db.query('SELECT * FROM public.profiles WHERE id=$1',[member])).rowCount,0);
  assert.equal((await db.query('SELECT * FROM public.dealers WHERE id<>$1',[org])).rowCount,0);
  assert.equal((await db.query('UPDATE public.profiles SET display_name=display_name WHERE id=$1',[fixture.a])).rowCount,1);
  await db.query('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[fixture.admin]);
  await asDealer(db,fixture.admin);await noOrganizationWrites(db,org);
  await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.a]);
  assert.equal((await db.query('SELECT * FROM public.profiles')).rowCount,1);
  assert.equal((await db.query('SELECT * FROM public.dealers')).rowCount,0);
  assert.equal((await db.query('SELECT * FROM public.products')).rowCount,0);
  await db.query('RESET ROLE');await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[fixture.admin]);
  await db.query("UPDATE public.user_roles SET role='dealer' WHERE user_id=$1",[fixture.admin]);
  await asDealer(db,fixture.admin);await denied(db,'SELECT public.set_dealer_profile_active($1,false)',[fixture.a]);
  await db.query('RESET ROLE');await db.query("UPDATE public.user_roles SET role='admin' WHERE user_id=$1",[fixture.admin]);
  await asDealer(db,fixture.admin);
  assert.equal((await db.query('SELECT * FROM public.orders')).rowCount,0);
  assert.equal((await db.query('SELECT * FROM public.order_items')).rowCount,0);
  console.log('PASS live DB status with unchanged claim values; profile-only vs whole-organization blocking of catalog/history/submission/retries; colleague access, self-name/diagnostics and admin-order denial preserved');
}
export async function testAdminDealers(db,baseline,products) {
  await db.query('BEGIN');
  try {await organizations(db,baseline);await authorization(db,baseline);await activation(db,baseline,products);}
  finally {await db.query('ROLLBACK');await db.query('RESET ROLE');}
}
