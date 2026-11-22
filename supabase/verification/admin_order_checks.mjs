// LOCAL PostgreSQL role/RLS queries only; never pass a hosted connection here.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, asDealer, submit } from './order_test_support.mjs';
import { visible } from './order_read_checks.mjs';
import { member } from './admin_dealer_checks.mjs';

export const transition = async (db, id, expected, next) => (await db.query(
  'SELECT public.transition_order_status($1::uuid,$2::text,$3::text) AS id', [id, expected, next])).rows[0].id;
async function rejected(db, sql, args = [], code = '42501') {
  await db.query('SAVEPOINT rejected_order_action');
  await assert.rejects(db.query(sql, args), { code });
  await db.query('ROLLBACK TO SAVEPOINT rejected_order_action'); await db.query('RELEASE SAVEPOINT rejected_order_action');
}
const rejectedTransition = (db, id, expected, next, code = '22023') => rejected(db,
  'SELECT public.transition_order_status($1::uuid,$2::text,$3::text)', [id, expected, next], code);
async function reads(db, before) {
  await asDealer(db, fixture.admin); await visible(db, before.orders, before.items);
  for (const actor of [fixture.a, member, fixture.b]) {
    await asDealer(db, actor);
    const org = before.profiles.find(p => p.id === actor).dealer_id, own = before.orders.filter(o => o.dealer_id === org);
    await visible(db, own, before.items.filter(i => own.some(o => o.id === i.order_id)));
    for (const order of before.orders) {
      assert.equal((await db.query('SELECT id FROM public.orders WHERE id=$1', [order.id])).rowCount, order.dealer_id === org ? 1 : 0);
      assert.equal((await db.query('SELECT * FROM public.order_items WHERE order_id=$1', [order.id])).rowCount,
        order.dealer_id === org ? before.items.filter(i => i.order_id === order.id).length : 0);
    }
  }
  await db.query('RESET ROLE');
  const org = before.profiles.find(p => p.id === fixture.a).dealer_id;
  await db.query('UPDATE public.dealers SET is_active=false WHERE id=$1', [org]);
  for (const actor of [fixture.a, member]) { await asDealer(db, actor); await visible(db, [], []); }
  await asDealer(db, fixture.admin); await visible(db, before.orders, before.items);
  await db.query('RESET ROLE'); await db.query('UPDATE public.dealers SET is_active=true WHERE id=$1', [org]);
  console.log('PASS active admin sees all orders/items/joins, including inactive organizations; dealers and colleagues retain organization-only UUID access');
}
async function authorization(db, before) {
  const id = before.orders[0].id;
  for (const actor of [fixture.a, fixture.b, member, randomUUID(), '']) {
    await asDealer(db, actor);
    await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: actor, user_metadata: { role: 'admin', is_active: true } })]);
    await rejectedTransition(db, id, 'submitted', 'processing', '42501');
    await rejected(db, 'SELECT private.transition_order_status($1,$2,$3)', [id, 'submitted', 'processing']);
  }
  await db.query('RESET ROLE'); await db.query('SET ROLE anon');
  for (const table of ['orders', 'order_items']) await rejected(db, `SELECT * FROM public.${table}`);
  await rejectedTransition(db, id, 'submitted', 'processing', '42501');
  await rejected(db, 'SELECT private.transition_order_status($1,$2,$3)', [id, 'submitted', 'processing']);
  for (const [change, restore] of [
    ['UPDATE public.profiles SET is_active=false WHERE id=$1', 'UPDATE public.profiles SET is_active=true WHERE id=$1'],
    ["UPDATE public.user_roles SET role='dealer' WHERE user_id=$1", "UPDATE public.user_roles SET role='admin' WHERE user_id=$1"],
    ['DELETE FROM public.user_roles WHERE user_id=$1', "INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin')"],
  ]) {
    await asDealer(db, fixture.admin); await db.query('RESET ROLE'); await db.query(change, [fixture.admin]);
    await db.query('SET ROLE authenticated'); await visible(db, [], []);
    await rejectedTransition(db, id, 'submitted', 'processing', '42501');
    await db.query('RESET ROLE'); await db.query(restore, [fixture.admin]);
  }
  await asDealer(db, fixture.a); await db.query('RESET ROLE');
  await db.query('UPDATE public.profiles SET is_active=false WHERE id=$1', [fixture.a]);
  await db.query('SET ROLE authenticated'); await visible(db, [], []);
  await rejectedTransition(db, id, 'submitted', 'processing', '42501');
  await db.query('RESET ROLE'); await db.query('UPDATE public.profiles SET is_active=true WHERE id=$1', [fixture.a]);
  console.log('PASS anonymous/dealer/inactive/missing/revoked-admin and forged-metadata denials; unchanged claims lose access after DB deactivation/revocation');
}
async function immutable(db, before) {
  for (const actor of [fixture.admin, fixture.a, fixture.b]) {
    await asDealer(db, actor);
    for (const [table, changes] of [
      ['orders', ["status='completed'", 'dealer_id=dealer_id', 'created_by=created_by', 'request_id=request_id', 'id=id', 'note=note', 'created_at=created_at', 'updated_at=updated_at']],
      ['order_items', ['quantity=1', 'unit_price_snapshot=0', "sku_snapshot='forged'", "name_snapshot='forged'", 'product_id=product_id', 'order_id=order_id']],
    ]) {
      for (const change of changes) await rejected(db, `UPDATE public.${table} SET ${change}`);
      for (const sql of [`INSERT INTO public.${table} DEFAULT VALUES`, `DELETE FROM public.${table}`, `TRUNCATE public.${table}`]) await rejected(db, sql);
    }
  }
  await db.query('RESET ROLE'); await db.query('SAVEPOINT accidental_write_grant');
  await db.query('GRANT INSERT,UPDATE,DELETE ON public.orders,public.order_items TO authenticated');
  for (const actor of [fixture.admin, fixture.a]) {
    await asDealer(db, actor);
    for (const table of ['orders', 'order_items']) {
      assert.equal((await db.query(`UPDATE public.${table} SET ${table === 'orders' ? "status='completed'" : 'quantity=1'}`)).rowCount, 0);
      assert.equal((await db.query(`DELETE FROM public.${table}`)).rowCount, 0);
    }
    await rejected(db, 'INSERT INTO public.orders(dealer_id,created_by,request_id) VALUES ($1,$2,$3)', [before.orders[0].dealer_id, fixture.a, randomUUID()]);
    const item = before.items[0];
    await rejected(db, 'INSERT INTO public.order_items(order_id,product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot) VALUES ($1,$2,1,0,$3,$4)',
      [item.order_id, item.product_id, 'forged', 'forged']);
  }
  await db.query('RESET ROLE'); await db.query('ROLLBACK TO SAVEPOINT accidental_write_grant');
  console.log('PASS all direct order/item writes denied by privileges and RLS independently; ownership, quantities, prices, snapshots and deletion protected');
}
async function transitions(db, before, products, conflictCode) {
  const order = before.orders.find(o => o.created_by === fixture.a), states = ['submitted', 'processing', 'completed', 'rejected'];
  const allowed = new Set(['submitted:processing', 'submitted:rejected', 'processing:completed', 'processing:rejected']);
  for (const from of states) for (const to of states) {
    await db.query('RESET ROLE'); await db.query('UPDATE public.orders SET status=$1 WHERE id=$2', [from, order.id]);
    const original = (await db.query('SELECT * FROM public.orders WHERE id=$1', [order.id])).rows[0];
    await asDealer(db, fixture.admin);
    if (allowed.has(`${from}:${to}`)) assert.equal(await transition(db, order.id, from, to), order.id);
    else await rejectedTransition(db, order.id, from, to);
    const saved = (await db.query('SELECT * FROM public.orders WHERE id=$1', [order.id])).rows[0];
    assert.deepEqual({ ...saved, status: original.status, updated_at: original.updated_at }, original);
    assert.equal(saved.status, allowed.has(`${from}:${to}`) ? to : from);
    if (allowed.has(`${from}:${to}`)) assert.ok(saved.updated_at > original.updated_at);
    else assert.deepEqual(saved, original);
  }
  await db.query('RESET ROLE'); await db.query("UPDATE public.orders SET status='submitted' WHERE id=$1", [order.id]);
  await asDealer(db, fixture.admin);
  for (const args of [[null, 'submitted', 'processing'], [order.id, null, 'processing'], [order.id, 'submitted', null],
    [order.id, 'pending', 'processing'], [order.id, 'submitted', 'approved'], [randomUUID(), 'submitted', 'processing']]) await rejectedTransition(db, ...args);
  await rejectedTransition(db, order.id, 'processing', 'completed', conflictCode);
  await transition(db, order.id, 'submitted', 'processing'); await transition(db, order.id, 'processing', 'completed');
  await rejectedTransition(db, order.id, 'submitted', 'processing', conflictCode);
  await db.query('RESET ROLE');
  await db.query("UPDATE public.products SET is_active=false,unit_price=99,name='Synthetic archived history' WHERE id=$1", [products[0].id]);
  await asDealer(db, fixture.admin);
  assert.deepEqual((await db.query('SELECT * FROM public.order_items ORDER BY order_id,product_id')).rows, before.items);
  await asDealer(db, fixture.a);
  const payload = before.items.filter(i => i.order_id === order.id).map(i => ({ product_id: i.product_id, quantity: i.quantity }));
  assert.equal(await submit(db, order.request_id, payload, order.note), order.id);
  await rejected(db, 'SELECT public.submit_order($1,$2::jsonb,$3)', [order.request_id, JSON.stringify(payload.map(i => ({ ...i, quantity: i.quantity + 1 }))), order.note], '23505');
  assert.equal((await db.query('SELECT status FROM public.orders WHERE id=$1', [order.id])).rows[0].status, 'completed');
  console.log('PASS all 16 status pairs, null/invalid/missing/stale inputs, terminal/repeated changes, only status/server timestamp edits, archived snapshots and unchanged submission retries/conflicts');
}
export async function testAdminOrders(db, before, products, conflictCode = 'PT409') {
  await db.query('BEGIN');
  try { await reads(db, before); await authorization(db, before); await immutable(db, before); await transitions(db, before, products, conflictCode); }
  finally { await db.query('ROLLBACK'); await db.query('RESET ROLE'); }
}
