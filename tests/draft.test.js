import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantity, validateItems, priceCents, estimate } from '../src/draft/model.js';
import { readDraft, writeDraft, clearDraft, draftKey } from '../src/draft/storage.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
test('quantities reject fractions, exponent notation, zero, negatives and overflow', () => {
  for (const value of ['', '0', '-1', '1.5', '1e2', 'Infinity', '1000', null]) assert.equal(quantity(value), null);
  assert.equal(quantity('1'), 1); assert.equal(quantity('999'), 999);
});
test('draft data accepts only unique UUIDs and bounded numeric quantities; extra prices are discarded', () => {
  assert.deepEqual(validateItems([{ productId: a, quantity: 2, price: 0, is_active: true }]), [{ productId: a, quantity: 2 }]);
  for (const items of [null, [{ productId: 'bad', quantity: 2 }], [{ productId: a, quantity: '2' }],
    [{ productId: a, quantity: 0 }], [{ productId: a, quantity: 2 }, { productId: a, quantity: 1 }]]) {
    assert.throws(() => validateItems(items));
  }
});
test('estimates use exact cents from current products, exclude unavailable IDs and reject overflow', () => {
  const items = [{ productId: a, quantity: 3 }, { productId: b, quantity: 2 }];
  assert.deepEqual(estimate(items, new Map([[a, { cents: priceCents('0.10') }]])), { cents: 30, unavailable: 1, units: 5 });
  assert.equal(priceCents('6.75'), 675);
  for (const value of ['NaN', -1, '1.001', '999999999999999999999']) assert.throws(() => priceCents(value));
  assert.throws(() => estimate(items, new Map([[a, { cents: Number.MAX_SAFE_INTEGER }]])));
});
test('storage survives reloads, isolates owners, clears only its owner, and reports corruption/quota errors', () => {
  const saved = new Map();
  globalThis.window = new EventTarget();
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  writeDraft(a, [{ productId: b, quantity: 3 }]);
  writeDraft(b, [{ productId: a, quantity: 7 }]);
  assert.deepEqual(readDraft(a), [{ productId: b, quantity: 3 }]);
  clearDraft(a); assert.deepEqual(readDraft(a), []);
  assert.deepEqual(readDraft(b), [{ productId: a, quantity: 7 }]);
  saved.set(draftKey(a), '{broken'); assert.throws(() => readDraft(a), /Clear it/);
  globalThis.localStorage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => writeDraft(b, []), /not saved/);
  assert.deepEqual(readDraft(b), [{ productId: a, quantity: 7 }]);
});
