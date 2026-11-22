import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { login as publicLogin, request, rpc, ok } from '../supabase/verification/order_live_support.mjs';

export const state = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const baseline = () => state('.verification/10b-before.json').data;
export const admin = () => state('.verification/demo-admin-candidate.json');
export const dealer = () => state('.verification/identity-live-state.json').a;
export const inactive = () => state('.verification/session-register-preview.json');
export const stage = () => process.env.PDP_ADMIN_ORDERS_NETLIFY === '1' ? 'netlify' : 'preview';
const ledgerPath = '.verification/admin-orders-ui-state.json';
export const ledger = () => existsSync(ledgerPath) ? state(ledgerPath) : { fixtures: [] };
const remember = value => writeFileSync(ledgerPath, JSON.stringify(value, null, 2), { mode: 0o600 });
export const fixture = name => ledger().fixtures.find(f => f.label === `${stage()}-${name}`);
export const cards = page => page.locator('#admin-order-list [data-order-id]');
export const detailPath = id => `/admin/orders/?id=${id}`;
export const joinedRow = row => ({ ...row, organization: baseline().dealers.find(d => d.id === row.dealer_id),
  order_items: baseline().items.filter(i => i.order_id === row.id) });
export async function login(page, user = admin(), role = 'admin') {
  await page.goto('/login/'); await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  if (role === 'inactive') await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  else await expect(page).toHaveURL(role === 'admin' ? /\/admin\/$/ : /\/catalog\//);
}
export async function openOrders(page) {
  await login(page); await page.getByRole('link', { name: 'Manage orders', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/orders\//); await expect(page.locator('#order-search-form fieldset')).toBeEnabled();
}
export async function openDetails(page, id) {
  await page.goto(detailPath(id)); await expect(page.locator('#order-content')).toBeVisible(); await expect(page.locator('#reload-order')).toBeEnabled();
}
export async function change(page, label, confirm = true) {
  await page.locator('#status-actions').getByRole('button', { name: label, exact: true }).click();
  const dialog = page.locator('#order-confirm'); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth; })).toBe(true);
  await dialog.getByRole('button', { name: confirm ? label === 'Reject order' ? 'Confirm rejection' : 'Confirm update' : 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
}
export async function ensureFixtures() {
  const saved = ledger(), labels = stage() === 'preview' ? ['complete', 'conflict'] : ['complete', 'conflict', 'reject'];
  const productIds = baseline().products.filter(p => p.is_active && p.sku.startsWith('PDP-DEMO-')).slice(0, 2).map(p => p.id);
  assert.equal(productIds.length, 2);
  for (const name of labels) if (!fixture(name)) saved.fixtures.push({ label: `${stage()}-${name}`, payload: {
    p_request_id: randomUUID(), p_items: productIds.slice(0, name === 'complete' ? 2 : 1).map((product_id, i) => ({ product_id, quantity: i + 2 })),
    p_note: `Synthetic Milestone 10B ${stage()}-${name} UI verification`,
  } });
  remember(saved); // Persist every intent before the first creation attempt.
  const token = await publicLogin(dealer());
  for (const record of saved.fixtures.filter(f => f.label.startsWith(stage() + '-'))) {
    const id = ok(await rpc(token, record.payload));
    assert.ok(!baseline().orders.some(o => o.id === id), 'Never use a pre-existing order as a UI fixture');
    if (record.id) assert.equal(record.id, id); else record.id = id;
    const rows = ok(await request(`/rest/v1/orders?id=eq.${id}&select=*,order_items(*)`, token)); assert.equal(rows.length, 1);
    record.initial ??= rows[0]; remember(saved);
  }
}
export async function status(record) {
  const rows = ok(await request(`/rest/v1/orders?id=eq.${record.id}&select=*`, await publicLogin(admin()))); assert.equal(rows.length, 1); return rows[0].status;
}
export async function externalProcessing(record) {
  assert.ok(ledger().fixtures.some(f => f.id === record.id)); assert.ok(!baseline().orders.some(o => o.id === record.id));
  assert.equal(ok(await request('/rest/v1/rpc/transition_order_status', await publicLogin(admin()), 'POST', {
    p_order_id: record.id, p_expected_status: 'submitted', p_new_status: 'processing',
  })), record.id);
}
export async function verifySnapshots() {
  const token = await publicLogin(admin());
  for (const record of ledger().fixtures) {
    const rows = ok(await request(`/rest/v1/orders?id=eq.${record.id}&select=*,order_items(*)`, token)); assert.equal(rows.length, 1);
    const current = rows[0], original = record.initial;
    assert.deepEqual({ ...current, status: original.status, updated_at: original.updated_at }, original);
  }
}
