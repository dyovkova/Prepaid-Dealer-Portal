import { expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { login as publicLogin, request, ok } from '../supabase/verification/order_live_support.mjs';
export const state = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const baseline = () => state('.verification/9b-before.json');
export const admin = () => state('.verification/demo-admin-candidate.json');
export const dealer = () => state('.verification/identity-live-state.json').a;
const manifest = '.verification/admin-dealers-ui-state.json';
export const fixture = () => existsSync(manifest) ? state(manifest) : { name: 'Synthetic 9B UI organization' };
export const remember = record => writeFileSync(manifest, JSON.stringify(record, null, 2), { mode: 0o600 });
export const groups = page => page.locator('#organization-grid [data-organization-id]');
export const profiles = page => page.locator('#profile-grid [data-profile-id]');
export const group = (page, id) => page.locator(`#organization-grid [data-organization-id="${id}"]`);
export const profile = (page, id) => page.locator(`#profile-grid [data-profile-id="${id}"]`);
export async function login(page, user, isAdmin = true) {
  await page.goto('/login/'); await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email); await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(isAdmin ? /\/admin\/$/ : /\/catalog\//);
}
export async function openDealers(page) {
  await login(page, admin()); await page.getByRole('link', { name: 'Manage dealers', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dealers\//); await expect(page.locator('#new-organization')).toBeEnabled();
}
export async function save(page, message = 'Organization renamed.') {
  await page.getByRole('button', { name: 'Save organization', exact: true }).click();
  await expect(page.locator('#dealers-feedback')).toHaveText(message); await expect(page.locator('#new-organization')).toBeEnabled();
}
export async function activation(page, row, subject, active, confirm = true) {
  const action = `${active ? 'Enable' : 'Disable'} ${subject}`;
  await row.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.locator('#dealer-confirm'); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth; })).toBe(true);
  await dialog.getByRole('button', { name: confirm ? action : 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  if (confirm) { await expect(page.locator('#new-organization')).toBeEnabled(); await expect(row.locator('[data-status]')).toHaveText(active ? 'Active' : 'Inactive'); }
}
export async function restore() {
  const token = await publicLogin(admin()), before = baseline();
  const original = before.dealers.find(row => row.id === dealer().dealerId);
  ok(await request(`/rest/v1/dealers?id=eq.${original.id}`, token, 'PATCH', { name: original.name, is_active: original.is_active }));
  ok(await request('/rest/v1/rpc/set_dealer_profile_active', token, 'POST', {
    p_profile_id: dealer().id, p_is_active: before.profiles.find(p => p.id === dealer().id).is_active,
  }));
  if (fixture().id) ok(await request(`/rest/v1/dealers?id=eq.${fixture().id}`, token, 'PATCH', { name: fixture().name, is_active: false }));
}
