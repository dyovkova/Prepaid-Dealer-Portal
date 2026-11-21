// Disposable local PostgreSQL only. These are real role/RLS queries, not HTTP Auth.
import assert from 'node:assert/strict';
import { fixture, asDealer } from './order_test_support.mjs';

export const sorted = rows => [...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export async function visible(db, orders, items) {
  assert.deepEqual(sorted((await db.query('SELECT * FROM public.orders')).rows),sorted(orders));
  assert.deepEqual(sorted((await db.query('SELECT * FROM public.order_items')).rows),sorted(items));
  const joined=await db.query('SELECT i.* FROM public.orders o JOIN public.order_items i ON i.order_id=o.id');
  assert.deepEqual(sorted(joined.rows),sorted(items));
}
export async function checkDenials(db, organization) {
  for(const actor of [fixture.a,fixture.b,fixture.admin,null]) {
    await asDealer(db,actor??'');
    if(!actor)await db.query('SET ROLE anon');
    for(const table of ['orders','order_items']) {
      if(!actor)await assert.rejects(db.query(`SELECT * FROM public.${table}`),{code:'42501'});
      for(const sql of [
        `INSERT INTO public.${table} DEFAULT VALUES`,
        `UPDATE public.${table} SET ${table==='orders'?"status='completed'":'quantity=1'}`,
        `DELETE FROM public.${table}`,`TRUNCATE public.${table}`,
      ])await assert.rejects(db.query(sql),{code:'42501'});
    }
  }
  // Exercise inactive write denials with the same subject/claims as an active user.
  await db.query('RESET ROLE');
  await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[fixture.a]);
  await asDealer(db);
  await visible(db,[],[]);
  await assert.rejects(db.query("UPDATE public.orders SET status='completed'"),{code:'42501'});
  await db.query('RESET ROLE');
  await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[fixture.a]);
  // Prove RLS also denies writes if a table privilege were accidentally added.
  await db.query('BEGIN');
  try {
    await db.query('GRANT INSERT,UPDATE,DELETE ON public.orders,public.order_items TO authenticated');
    await asDealer(db);
    assert.equal((await db.query("UPDATE public.orders SET status='completed'")).rowCount,0);
    assert.equal((await db.query('DELETE FROM public.order_items')).rowCount,0);
    await db.query('SAVEPOINT denied_insert');
    await assert.rejects(db.query(`INSERT INTO public.orders(dealer_id,created_by,request_id)
      VALUES ($1,$2,gen_random_uuid())`,[organization,fixture.a]),{code:'42501'});
    await db.query('ROLLBACK TO SAVEPOINT denied_insert');
  } finally {await db.query('RESET ROLE');await db.query('ROLLBACK');}
}
export async function checkLiveStatus(db, member, organization, orders, items) {
  await asDealer(db);
  for(const [disable,restore] of [
    ['UPDATE public.profiles SET is_active=false WHERE id=$1','UPDATE public.profiles SET is_active=true WHERE id=$1'],
    ["UPDATE public.user_roles SET role='admin' WHERE user_id=$1","UPDATE public.user_roles SET role='dealer' WHERE user_id=$1"],
    ['DELETE FROM public.user_roles WHERE user_id=$1',"INSERT INTO public.user_roles(user_id,role) VALUES ($1,'dealer')"],
    ['UPDATE public.profiles SET dealer_id=NULL WHERE id=$1','UPDATE public.profiles SET dealer_id=$2 WHERE id=$1'],
  ]) {
    await db.query('RESET ROLE');await db.query(disable,[fixture.a]);
    await db.query('SET ROLE authenticated');await visible(db,[],[]);
    await db.query('RESET ROLE');await db.query(restore,restore.includes('$2')?[fixture.a,organization]:[fixture.a]);
    await db.query('SET ROLE authenticated');await visible(db,orders,items);
  }
  await db.query('RESET ROLE');
  await db.query('UPDATE public.dealers SET is_active=false WHERE id=$1',[organization]);
  for(const actor of [fixture.a,member]) {await asDealer(db,actor);await visible(db,[],[]);}
  await db.query('RESET ROLE');
  await db.query('UPDATE public.dealers SET is_active=true WHERE id=$1',[organization]);
  await asDealer(db);await visible(db,orders,items);
}
