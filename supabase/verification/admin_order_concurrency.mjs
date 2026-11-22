// Independent LOCAL PostgreSQL sessions; observe actual lock waits, not timing guesses.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, asDealer, submit } from './order_test_support.mjs';
import { transition } from './admin_order_checks.mjs';

export async function testAdminOrderConcurrency(cluster, owner, products, conflictCode = 'PT409') {
  const clients = [];
  const connect = async () => {
    const db = cluster.getPgClient('postgres', '127.0.0.1'); clients.push(db);
    await db.connect(); await db.query("SET statement_timeout='10s'"); return db;
  };
  const first = await connect(), second = await connect(), writer = await connect(), dealer = await connect();
  await asDealer(first, fixture.admin); await asDealer(second, fixture.admin); await asDealer(dealer, fixture.a);
  const items = [{ product_id: products[0].id, quantity: 2 }];
  const newOrder = key => submit(dealer, key, items, 'Synthetic local 10A race');
  const settle = promise => promise.then(value => ({ value }), error => ({ error }));
  const status = async id => (await owner.query('SELECT status FROM public.orders WHERE id=$1', [id])).rows[0].status;
  const waiting = async db => {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if ((await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [db.processID])).rows[0]?.wait_event_type === 'Lock') return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected an observed PostgreSQL row-lock wait');
  };
  try {
    for (const target of ['processing', 'rejected']) {
      const id = await newOrder(randomUUID());
      await first.query('BEGIN'); await transition(first, id, 'submitted', 'processing');
      const pending = settle(transition(second, id, 'submitted', target)); await waiting(second);
      await first.query('COMMIT'); assert.equal((await pending).error?.code, conflictCode); assert.equal(await status(id), 'processing');
    }
    console.log('PASS duplicate and competing submitted transitions serialize; stale expected status fails without overwriting');

    for (const winner of ['completed', 'rejected']) {
      const id = await newOrder(randomUUID()); await transition(first, id, 'submitted', 'processing');
      await first.query('BEGIN'); await transition(first, id, 'processing', winner);
      const loser = winner === 'completed' ? 'rejected' : 'completed';
      const pending = settle(transition(second, id, 'processing', loser)); await waiting(second);
      await first.query('COMMIT'); assert.equal((await pending).error?.code, conflictCode); assert.equal(await status(id), winner);
      await assert.rejects(transition(second, id, winner, loser), { code: '22023' });
    }
    console.log('PASS competing terminal updates have one winner; completed/rejected cannot reopen');

    let id = await newOrder(randomUUID());
    await first.query('BEGIN'); await transition(first, id, 'submitted', 'processing');
    const pending = settle(transition(second, id, 'submitted', 'rejected')); await waiting(second);
    await first.query('ROLLBACK'); assert.equal((await pending).value, id); assert.equal(await status(id), 'rejected');
    console.log('PASS outer rollback releases the order unchanged, allowing the waiting valid transition');

    const one = await newOrder(randomUUID()), two = await newOrder(randomUUID());
    await first.query('BEGIN'); await transition(first, one, 'submitted', 'processing');
    assert.equal(await transition(second, two, 'submitted', 'rejected'), two); await first.query('COMMIT');
    console.log('PASS distinct orders transition independently while sharing admin authority locks');

    for (const [change, restore] of [
      ['UPDATE public.profiles SET is_active=false WHERE id=$1', 'UPDATE public.profiles SET is_active=true WHERE id=$1'],
      ["UPDATE public.user_roles SET role='dealer' WHERE user_id=$1", "UPDATE public.user_roles SET role='admin' WHERE user_id=$1"],
    ]) {
      id = await newOrder(randomUUID()); await writer.query('BEGIN'); await writer.query(change, [fixture.admin]);
      const blocked = settle(transition(first, id, 'submitted', 'processing')); await waiting(first); await writer.query('COMMIT');
      assert.equal((await blocked).error?.code, '42501'); assert.equal(await status(id), 'submitted');
      await writer.query(restore, [fixture.admin]);
      await first.query('BEGIN'); await transition(first, id, 'submitted', 'processing');
      const revoke = settle(writer.query(change, [fixture.admin])); await waiting(writer);
      await first.query('COMMIT'); assert.ok((await revoke).value); assert.equal(await status(id), 'processing');
      await assert.rejects(transition(second, id, 'processing', 'completed'), { code: '42501' });
      await writer.query(restore, [fixture.admin]);
    }
    console.log('PASS inactive/demoted admin rejected after identity lock waits; authorized operations hold profile/role authority until commit');

    const key = randomUUID(); id = await newOrder(key);
    const snapshots = (await owner.query('SELECT * FROM public.order_items WHERE order_id=$1', [id])).rows;
    await first.query('BEGIN'); await transition(first, id, 'submitted', 'processing');
    assert.equal(await newOrder(key), id); await first.query('COMMIT');
    assert.equal(await newOrder(key), id); assert.equal(await status(id), 'processing');
    assert.deepEqual((await owner.query('SELECT * FROM public.order_items WHERE order_id=$1', [id])).rows, snapshots);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.orders WHERE request_id=$1', [key])).rows[0].n, 1);
    console.log('PASS submission replay concurrent with/after processing preserves status, snapshots and one original order');
  } finally {
    for (const db of clients) await owner.query('SELECT pg_cancel_backend($1)', [db.processID]).catch(() => {});
    for (const db of clients) { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
  }
}
