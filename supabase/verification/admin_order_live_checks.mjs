// Public Auth/Data API helpers. Status-changing calls are restricted to new ledger fixtures.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { request, ok, denied } from './order_live_support.mjs';

const identity = row => row.id ?? `${row.order_id}:${row.product_id}`;
const sorted = rows => [...rows].sort((a, b) => identity(a).localeCompare(identity(b)));
export const same = (actual, expected, message) => assert.ok(isDeepStrictEqual(actual, expected), message);
export async function statusRpc(token, body, headers) {
  const start = performance.now();
  const response = await request('/rest/v1/rpc/transition_order_status', token, 'POST', body, headers);
  return { ...response, elapsedMs: Math.round(performance.now() - start) };
}
export async function orderRow(token, id) {
  const rows = ok(await request(`/rest/v1/orders?id=eq.${id}&select=*`, token));
  assert.equal(rows.length, 1); return rows[0];
}
export async function assertReads(token, orders, items) {
  same(sorted(ok(await request('/rest/v1/orders?select=*', token))), sorted(orders), 'Visible orders match expected scope');
  same(sorted(ok(await request('/rest/v1/order_items?select=*', token))), sorted(items), 'Visible snapshots match expected scope');
  const joined = ok(await request('/rest/v1/orders?select=*,order_items(*)', token));
  assert.equal(joined.length, orders.length);
  for (const order of joined) same(sorted(order.order_items), sorted(items.filter(i => i.order_id === order.id)), 'Parent/item join preserves snapshots');
}
export async function dealerScope(token, account, data) {
  const own = data.orders.filter(o => o.dealer_id === account.dealerId), ids = new Set(own.map(o => o.id));
  await assertReads(token, own, data.items.filter(i => ids.has(i.order_id)));
  for (const row of data.orders) {
    assert.equal(ok(await request(`/rest/v1/orders?id=eq.${row.id}&select=id`, token)).length, ids.has(row.id) ? 1 : 0);
    assert.equal(ok(await request(`/rest/v1/order_items?order_id=eq.${row.id}&select=*`, token)).length,
      ids.has(row.id) ? data.items.filter(i => i.order_id === row.id).length : 0);
  }
}
export async function transitionFixture(token, record, expected, next, baseline, code = null) {
  assert.ok(record.id && !baseline.orders.some(o => o.id === record.id), 'Never transition a pre-existing order');
  assert.ok(record.payload.p_note.startsWith('Synthetic Milestone 10A '));
  const before = await orderRow(token, record.id);
  const response = await statusRpc(token, { p_order_id: record.id, p_expected_status: expected, p_new_status: next });
  if (code) {
    assert.ok(response.status >= 400); assert.equal(response.body?.code, code);
    if (code === 'PT409') { assert.equal(response.status, 409); assert.ok(response.elapsedMs < 5000, 'Stale conflict must return promptly'); }
  }
  else assert.equal(ok(response), record.id);
  const after = await orderRow(token, record.id);
  if (code) same(after, before, 'Rejected change preserves complete order');
  else {
    assert.equal(after.status, next); assert.notEqual(after.updated_at, before.updated_at);
    same({ ...after, status: before.status, updated_at: before.updated_at }, before, 'Only status and timestamp may change');
  }
  return response;
}
export async function noStatusAccess(token, record) {
  denied(await statusRpc(token, { p_order_id: record.id, p_expected_status: 'submitted', p_new_status: 'processing' }));
}
export async function noDirectWrites(token, order, item) {
  for (const [key, value] of Object.entries(order)) {
    denied(await request(`/rest/v1/orders?id=eq.${order.id}`, token, 'PATCH', { [key]: value }));
  }
  for (const [key, value] of Object.entries(item)) {
    denied(await request(`/rest/v1/order_items?order_id=eq.${item.order_id}&product_id=eq.${item.product_id}`, token, 'PATCH', { [key]: value }));
  }
  for (const table of ['orders', 'order_items']) {
    denied(await request(`/rest/v1/${table}`, token, 'POST', {}));
    const filter = table === 'orders' ? `id=eq.${order.id}` : `order_id=eq.${order.id}&product_id=eq.${item.product_id}`;
    denied(await request(`/rest/v1/${table}?${filter}`, token, 'DELETE'));
  }
}
