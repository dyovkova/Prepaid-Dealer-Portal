import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productValues, adminProduct, filterProducts, productError } from '../src/admin-products/model.js';
const id = '00000000-0000-4000-8000-000000008b01';
const input = { sku: ' Test-sku ', name: ' Synthetic name ', description: ' Demo ', unit_price: '01.5' };
test('admin product input sends only editable fields and exact bounded EUR decimals', () => {
  assert.deepEqual(productValues({ ...input, id, is_active: false, created_at: 'forged', role: 'admin' }),
    { sku: 'Test-sku', name: 'Synthetic name', description: 'Demo', unit_price: '1.50' });
  for (const price of ['0', '0.01', '9999999999.99']) assert.ok(productValues({ ...input, unit_price: price }));
  for (const price of ['', '-1', 'NaN', 'Infinity', '1e2', '1.234', '1,50', '10000000000']) {
    assert.throws(() => productValues({ ...input, unit_price: price }), { field: 'unit_price' });
  }
  assert.throws(() => productValues({ ...input, sku: '  ' }), { field: 'sku' });
  assert.throws(() => productValues({ ...input, name: '' }), { field: 'name' });
});
test('server product records retain exact text and filters include inactive rows only when selected', () => {
  const active = adminProduct({ ...input, id, is_active: true });
  assert.equal(active.sku, input.sku); assert.equal(active.cents, 150);
  const inactive = { ...active, id: id.replace('8b01', '8b02'), name: 'Archived', is_active: false };
  assert.deepEqual(filterProducts([active, inactive], 'test-SKU', 'all'), [active, inactive]);
  assert.deepEqual(filterProducts([active, inactive], '', 'inactive'), [inactive]);
  assert.deepEqual(filterProducts([active, inactive], 'archived', 'active'), []);
  assert.throws(() => adminProduct({ ...active, is_active: 'true' }));
});
test('duplicate, forbidden, zero-row and uncertain saves have distinct actionable feedback', () => {
  assert.match(productError({ code: '23505' }, true), /SKU is already in use/);
  assert.match(productError({ code: '42501' }, true), /Administrator access/);
  assert.match(productError({ code: 'product_unavailable' }, true), /access changed/);
  assert.match(productError({}, true), /may already be saved/);
});
