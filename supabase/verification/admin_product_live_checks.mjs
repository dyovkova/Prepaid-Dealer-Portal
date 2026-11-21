// Public Data API checks. Tokens stay in memory; callers supply controlled IDs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request,ok,denied } from './order_live_support.mjs';

const returning = { Prefer: 'return=representation' };
export const products = (token, filter = '') => request(`/rest/v1/products?select=*&order=sku.asc${filter}`, token);
export const patch = (token, id, values) => request(`/rest/v1/products?id=eq.${id}`, token, 'PATCH', values, returning);
export const insert = (token, values) => request('/rest/v1/products', token, 'POST', values, returning);
export async function deleteDenied(token, id) {
  denied(await request(`/rest/v1/products?id=eq.${id}`, token, 'DELETE', undefined, returning));
}
export async function writesDenied(token, id) {
  denied(await insert(token, { sku: 'PDP-TEST-8A-DENIED', name: 'Forbidden synthetic product', unit_price: 1 }));
  for (const change of [{ unit_price: 99 }, { is_active: false }, { is_active: true }]) {
    const response = await patch(token, id, change);
    if (token) assert.deepEqual(ok(response), []); // UPDATE privilege exists; RLS hides all writable rows.
    else denied(response);
  }
  await deleteDenied(token, id);
}
export async function constraints(token, fixture, existingSku) {
  const invalid = [
    [{ sku: null }, '23502'], [{ sku: '' }, '23514'], [{ sku: '   ' }, '23514'],
    [{ name: null }, '23502'], [{ name: '' }, '23514'],
    [{ unit_price: null }, '23502'], [{ unit_price: -0.01 }, '23514'],
    [{ unit_price: 'NaN' }, '23514'], [{ unit_price: 'Infinity' }, '22003'],
    [{ unit_price: '10000000000' }, '22003'], [{ description: null }, '23502'], [{ is_active: null }, '23502'],
  ];
  for (const [values, code] of invalid) {
    for (const response of [await patch(token, fixture.id, values),
      await insert(token, { sku: 'PDP-TEST-8A-INVALID', name: 'Synthetic invalid product', unit_price: 1, ...values })]) {
      assert.equal(response.status, 400); assert.equal(response.body?.code, code);
    }
  }
  const duplicate = await insert(token, { sku: fixture.sku, name: 'Duplicate synthetic product', unit_price: 1 });
  assert.equal(duplicate.status, 409); assert.equal(duplicate.body?.code, '23505');
  const conflict = await patch(token, fixture.id, { sku: existingSku });
  assert.equal(conflict.status, 409); assert.equal(conflict.body?.code, '23505');
  for (const values of [{ id: fixture.id }, { created_at: fixture.created_at }]) denied(await patch(token, fixture.id, values));
  denied(await insert(token, { id: randomUUID(), sku: 'PDP-TEST-8A-ID', name: 'Forbidden ID', unit_price: 1 }));
  assert.equal(ok(await patch(token, fixture.id, { unit_price: 0 }))[0].unit_price, 0);
}
export async function history(token, baseline, dealer) {
  const orders = baseline.orders.filter(o => o.dealer_id === dealer.dealerId);
  const items = baseline.items.filter(i => orders.some(o => o.id === i.order_id));
  const key = row => row.id ?? `${row.order_id}:${row.product_id}`;
  const sorted = rows => [...rows].sort((a,b) => key(a).localeCompare(key(b)));
  assert.deepEqual(sorted(ok(await request('/rest/v1/orders?select=*', token))), sorted(orders));
  assert.deepEqual(sorted(ok(await request('/rest/v1/order_items?select=*', token))), sorted(items));
  for (const order of baseline.orders) {
    assert.deepEqual(ok(await request(`/rest/v1/orders?id=eq.${order.id}&select=*`, token)), order.dealer_id===dealer.dealerId?[order]:[]);
    assert.deepEqual(sorted(ok(await request(`/rest/v1/order_items?order_id=eq.${order.id}&select=*`, token))), sorted(items.filter(i => i.order_id === order.id)));
  }
}
