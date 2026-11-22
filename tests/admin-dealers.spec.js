import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { baseline, admin, dealer, fixture, remember, groups, profiles, group, profile, login, openDealers, save, activation, restore } from './admin-dealer-support.js';
import { login as publicLogin, request, ok } from '../supabase/verification/order_live_support.mjs';
import { noAdministration, protectedIdentity, businessBlocked } from '../supabase/verification/admin_dealer_live_checks.mjs';

test.skip(process.env.PDP_ADMIN_DEALERS_UI !== '1', 'Opt in: existing accounts, one reusable synthetic organization, restored dealer statuses; no users/orders');
let errors, forbidden, writes;
test.beforeEach(async ({ context }) => {
  errors = []; forbidden = []; writes = [];
  const watch = page => page.on('pageerror', error => errors.push(error.message));
  context.pages().forEach(watch); context.on('page', watch);
  await context.route('**/rest/v1/**', async route => {
    const r = route.request(), url = new URL(r.url()), path = url.pathname;
    if (r.method() !== 'GET') {
      const body = r.postDataJSON(); writes.push({ path, method: r.method(), body });
      const allowed = path === '/rest/v1/dealers' && (r.method() === 'POST'
        ? body.name === fixture().name && Object.keys(body).join() === 'name'
        : r.method() === 'PATCH' && [fixture().id, dealer().dealerId].some(id => id && url.searchParams.get('id') === `eq.${id}`)
          && Object.keys(body).every(k => ['name', 'is_active'].includes(k)))
        || path === '/rest/v1/rpc/set_dealer_profile_active' && r.method() === 'POST'
          && body.p_profile_id === dealer().id && Object.keys(body).sort().join() === 'p_is_active,p_profile_id';
      if (!allowed) { forbidden.push(path); return route.abort(); }
    }
    await route.continue();
  });
  context.on('request', r => { if (/\/auth\/v1\/admin|\/storage\/v1/.test(r.url())) forbidden.push('out of scope'); });
});
test.afterEach(async ({}, info) => {
  await restore(); expect(errors).toEqual([]); expect(forbidden).toEqual([]);
  writeFileSync(`.verification/9b-${process.env.PDP_ADMIN_DEALERS_NETLIFY === '1' ? 'netlify' : 'preview'}-${info.testId.replace(/[^a-z0-9]/gi, '').slice(-16)}.json`,
    JSON.stringify({ test: info.title, status: info.status, writes, errors, forbidden }, null, 2));
});

test('real admin organization creation/rename, counts, filters, confirmations, refresh and mobile', async ({ page }) => {
  await openDealers(page);
  await expect(groups(page)).toHaveCount(baseline().dealers.length + (fixture().id ? 1 : 0));
  await expect(profiles(page)).toHaveCount(baseline().profiles.length);
  await expect(group(page, dealer().dealerId)).toContainText('1 associated user');
  await expect(profile(page, admin().id)).toContainText('Database role: admin');
  await expect(profile(page, admin().id).getByRole('button')).toHaveCount(0);
  if (!fixture().id) {
    await page.locator('#new-organization').click(); await page.getByRole('button', { name: 'Save organization', exact: true }).click();
    await expect(page.locator('#organization-editor [role="status"]')).toContainText('nonblank'); expect(writes).toEqual([]);
    await page.getByLabel('Organization name', { exact: true }).fill(fixture().name);
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/dealers');
    await page.locator('#organization-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await expect(page.locator('#dealers-feedback')).toHaveText('Organization created. No user account was created.');
    const data = await (await response).json(); remember({ ...fixture(), id: (Array.isArray(data) ? data[0] : data).id });
    expect(writes.filter(w => w.method === 'POST')).toHaveLength(1);
  }
  const id = fixture().id;
  await group(page, id).getByRole('button', { name: 'Rename organization', exact: true }).click();
  await page.getByLabel('Organization name', { exact: true }).fill('Synthetic 9B edited organization'); await save(page);
  await expect(group(page, id)).toContainText('0 associated users');
  await page.getByLabel('Search organizations', { exact: true }).fill('9B EDITED'); await expect(groups(page)).toHaveCount(1);
  if ((await group(page, id).locator('[data-status]').textContent()) === 'Inactive') await activation(page, group(page, id), 'organization', true);
  await page.getByLabel('Organization status', { exact: true }).selectOption('inactive'); await expect(groups(page)).toHaveCount(0);
  await expect(page.locator('#organizations-empty')).toContainText('No organizations match');
  await page.getByLabel('Organization status', { exact: true }).selectOption('all'); await page.getByLabel('Search organizations', { exact: true }).fill('');
  const count = writes.length; await activation(page, group(page, id), 'organization', false, false); expect(writes.length).toBe(count);
  await activation(page, group(page, id), 'organization', false); await activation(page, group(page, id), 'organization', true);
  await page.getByLabel('Search profiles', { exact: true }).fill('ADMIN'); await expect(profiles(page)).toHaveCount(1);
  await page.getByLabel('Search profiles', { exact: true }).fill(''); await page.getByLabel('Profile status', { exact: true }).selectOption('inactive');
  await expect(profiles(page)).toHaveCount(baseline().profiles.filter(p => !p.is_active).length);
  await page.reload(); await expect(group(page, id)).toContainText('Synthetic 9B edited organization');
  await page.screenshot({ path: '.verification/admin-dealers-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await group(page, id).getByRole('button', { name: 'Rename organization', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.verification/admin-dealers-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
    await activation(page, group(page, id), 'organization', false, false);
  }
  await activation(page, group(page, id), 'organization', false);
});

test('real profile RPC and organization disabling block existing dealer JWT and preserve local recovery', async ({ page, browser, baseURL }) => {
  await openDealers(page); const token = await publicLogin(dealer());
  const replay = JSON.parse((await import('node:fs')).readFileSync('.verification/submission-ui-fixture.json', 'utf8')).normal.payload;
  const dealerContext = await browser.newContext({ baseURL });
  try {
    const tab = await dealerContext.newPage(); await login(tab, dealer(), false);
    const key = `pdp:order-draft:v1:niabpabsvdgxackjjcsb:${dealer().id}`;
    const draft = JSON.stringify({ version: 1, items: [] }); await tab.evaluate(([k, v]) => localStorage.setItem(k, v), [key, draft]);
    const count = writes.length; await activation(page, profile(page, dealer().id), 'user', false, false); expect(writes.length).toBe(count);
    await activation(page, profile(page, dealer().id), 'user', false);
    await businessBlocked(token, replay); await noAdministration(token, fixture().id, dealer().id);
    await tab.reload(); await expect(tab.locator('#account-status')).toContainText('Your account is inactive');
    await expect(tab.locator('#protected-content')).toBeHidden(); expect(await tab.evaluate(k => localStorage.getItem(k), key)).toBe(draft);
    await activation(page, profile(page, dealer().id), 'user', true);
    await tab.reload(); await expect(tab.locator('#product-grid [data-product-id]')).toHaveCount(10);
    await activation(page, group(page, dealer().dealerId), 'organization', false);
    await expect(profile(page, dealer().id)).toContainText('Business access stays blocked');
    await businessBlocked(token, replay); await tab.reload(); await expect(tab.locator('#protected-content')).toBeHidden();
    await expect(tab.locator('#account-status')).toContainText('organization');
    expect(await tab.evaluate(k => localStorage.getItem(k), key)).toBe(draft);
    await activation(page, group(page, dealer().dealerId), 'organization', true);
    await tab.reload(); await expect(tab.locator('#product-grid [data-product-id]')).toHaveCount(10);
    expect(writes.some(w => w.path === '/rest/v1/profiles')).toBe(false);
  } finally { await dealerContext.close(); }
});

test('anonymous/dealer/inactive guards, real RLS and protected identities', async ({ page }) => {
  await page.goto('/admin/dealers/'); await expect(page).toHaveURL(/\/login\//);
  await login(page, dealer(), false); await page.goto('/admin/dealers/'); await expect(page).toHaveURL(/\/catalog\//);
  await page.reload(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  for (const token of [null, await publicLogin(dealer())]) await noAdministration(token, fixture().id, dealer().id);
  await protectedIdentity(await publicLogin(admin()), dealer().id, fixture().id);
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await login(page, admin());
  await page.route('**/rest/v1/profiles?**', async route => {
    const response = await route.fetch(), body = await response.json();
    await route.fulfill({ response, json: Array.isArray(body) ? body.map(p => ({ ...p, is_active: false })) : { ...body, is_active: false } });
  });
  await page.goto('/admin/dealers/'); await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await expect(page.locator('#protected-content')).toBeHidden(); await expect(groups(page)).toHaveCount(0);
});

test('loading/errors, empty/retry, pagination, safe text and uncertain/zero-row mutations', async ({ page }) => {
  await login(page, admin()); let mode = 'failure'; const row = baseline().dealers[0];
  await page.route('**/rest/v1/dealers?**', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    if (mode === 'failure') return route.fulfill({ status: 503, json: { message: 'Controlled outage' } });
    if (mode === 'empty') return route.fulfill({ json: [] });
    if (mode === 'safe') return route.fulfill({ json: [{ ...row, name: '<img src=x onerror="window.badDealer=true">' }] });
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
    await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ json: offset ? [baseline().dealers.find(g => g.id === dealer().dealerId)]
      : Array.from({ length: 200 }, (_, i) => ({ ...row, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })) });
  });
  await page.goto('/admin/dealers/'); await expect(page.locator('#dealers-state')).toContainText('Could not load');
  await expect(page.locator('#new-organization')).toBeDisabled();
  mode = 'empty'; await page.locator('#reload-dealers').click(); await expect(groups(page)).toHaveCount(0); await expect(page.locator('#new-organization')).toBeEnabled();
  await page.locator('#new-organization').click(); await page.getByLabel('Organization name', { exact: true }).fill(fixture().name);
  await page.route('**/rest/v1/dealers?**', route => route.request().method() === 'POST' ? route.abort() : route.fallback());
  await page.getByRole('button', { name: 'Save organization', exact: true }).click();
  await expect(page.locator('#dealers-feedback')).toContainText('may already be saved');
  await expect(page.getByLabel('Organization name', { exact: true })).toHaveValue(fixture().name);
  await expect(page.getByRole('button', { name: 'Save organization', exact: true })).toBeDisabled();
  mode = 'safe'; await page.locator('#reload-dealers').click(); await expect(groups(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click();
  await expect(groups(page).locator('h3')).toContainText('<img'); expect(await page.evaluate(() => window.badDealer)).toBeUndefined();
  await expect(page.locator('#organization-grid img, #organization-grid script')).toHaveCount(0);
  mode = 'pages'; await page.locator('#reload-dealers').click(); await expect(page.locator('#dealers-state')).toContainText('Loading');
  await expect(groups(page)).toHaveCount(201);
  await page.route('**/rest/v1/rpc/set_dealer_profile_active', route => route.fulfill({ json: null }));
  await profile(page, dealer().id).getByRole('button', { name: 'Disable user', exact: true }).click();
  await page.locator('#dealer-confirm').getByRole('button', { name: 'Disable user', exact: true }).click();
  await expect(page.locator('#dealers-feedback')).toContainText('access changed');
});
