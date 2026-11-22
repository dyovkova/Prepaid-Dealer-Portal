import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminOrder, adminOrderPath, nextStatuses, listOptions, listState, literalPattern, adminOrderError, isOrderConflict } from '../src/admin-orders/model.js';
const id = '00000000-0000-4000-8000-000000000001', org = '00000000-0000-4000-8000-000000000002';
const row = { id, dealer_id: org, organization: { id: org, name: 'Demo organization' }, status: 'submitted', created_at: '2026-11-22T00:00:00Z', note: null,
  order_items: [{ product_id: id, quantity: 2, sku_snapshot: 'DEMO-SAVED', name_snapshot: 'Saved name', unit_price_snapshot: '9.99' }] };
test('admin history uses saved snapshots/exact totals and the authorized organization', () => {
  const order = adminOrder({ ...row, unit_price: '999.99', name: 'Current catalog name' });
  assert.equal(order.totalCents, 1998n); assert.equal(order.items[0].name, 'Saved name'); assert.equal(order.organizationName, 'Demo organization');
  assert.throws(() => adminOrder({ ...row, organization: { id, name: 'Wrong organization' } }));
  assert.throws(() => adminOrder({ ...row, organization: null })); assert.throws(() => adminOrder({ ...row, dealer_id: 'bad' }));
});
test('only four forward transitions are offered; terminal and unknown states are immutable', () => {
  assert.deepEqual(nextStatuses('submitted'), ['processing', 'rejected']); assert.deepEqual(nextStatuses('processing'), ['completed', 'rejected']);
  for (const status of ['completed', 'rejected', 'pending', '__proto__']) assert.deepEqual(nextStatuses(status), []);
  nextStatuses('submitted').push('completed'); assert.deepEqual(nextStatuses('submitted'), ['processing', 'rejected']);
});
test('admin order links reject malformed references and cannot route into arbitrary paths', () => {
  assert.equal(adminOrderPath(id), `/admin/orders/?id=${id}`);
  for (const invalid of ['../admin/', '', `${id}&role=admin`, null]) assert.throws(() => adminOrderPath(invalid));
});
test('server pagination/filter inputs are bounded and list URL state survives refresh', () => {
  assert.deepEqual(listState('?q=Demo&status=processing&page=2'), { search: 'Demo', status: 'processing', page: 1 });
  assert.deepEqual(listState('?page=-1&status=owner'), listOptions());
  assert.deepEqual(listOptions({ search: ' Demo ' }), { search: 'Demo', status: 'all', page: 0 });
  for (const options of [{ page: -1 }, { page: 0.5 }, { page: Number.MAX_SAFE_INTEGER }, { status: '__proto__' }, { search: 'x'.repeat(161) }]) assert.throws(() => listOptions(options));
  assert.equal(literalPattern('50%_\\demo'), '%50\\%\\_\\\\demo%');
});
test('conflicts and uncertain outcomes explain reload without implying a mutation retry', () => {
  assert.equal(isOrderConflict({ code: 'PT409' }), true); assert.equal(isOrderConflict({ status: 409 }), true);
  assert.match(adminOrderError({ code: 'PT409' }, true), /not retried/);
  assert.match(adminOrderError({}, true), /no automatic retry/); assert.match(adminOrderError({ code: '42501' }), /Administrator access/);
});
