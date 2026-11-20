import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { draftKey } from '../src/draft/storage.js';
import { loadEnv } from 'vite';

test.skip(process.env.PDP_CATALOG_UI_LIVE !== '1', 'Opt in to existing controlled demo account logins; no DB writes or account creation.');
const state = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const accounts = () => state('.verification/identity-live-state.json');
const baseline = () => state('.verification/catalog-ui-before.json').products;
const product = sku => baseline().find(p => p.sku === sku);
const credit = () => product('PDP-DEMO-CREDIT-005');
const data = () => product('PDP-DEMO-DATA-005');
const card = (page, p) => page.locator(`[data-product-id="${p.id}"]`);
const counter = page => page.locator('#site-header [data-draft-count]');
const api = '**/rest/v1/products?**';
const config = loadEnv('production', process.cwd(), 'VITE_');
let pageErrors, forbidden;
test.beforeEach(async ({ page }) => {
  pageErrors = []; forbidden = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (/\/rest\/v1\//.test(request.url()) && (request.method() !== 'GET' || /\/(orders|order_items)/.test(request.url()))) forbidden.push(request.method());
    if (/\/storage\/v1|\/auth\/v1\/admin/.test(request.url())) forbidden.push('out-of-scope');
  });
});
test.afterEach(() => { expect(pageErrors).toEqual([]); expect(forbidden).toEqual([]); });
async function login(page, account, admin = false) {
  await page.goto('/login/');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(admin ? /\/admin\// : /\/catalog\//);
  await expect(page.locator('#protected-content')).toBeVisible();
  if (!admin) await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
}
async function add(page, p, amount) {
  await card(page, p).getByLabel('Quantity', { exact: true }).fill(String(amount));
  await card(page, p).getByRole('button', { name: 'Add to draft' }).click();
}
async function saved(page, userId) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey(userId));
}
async function seedDraft(page, userId, items) {
  await page.evaluate(({ key, items }) => localStorage.setItem(key, JSON.stringify({ version: 1, items })), { key: draftKey(userId), items });
}

test('real dealer catalog, search, quantities, estimates, editing, persistence and empty draft', async ({ page }) => {
  const a = accounts().a;
  for (const route of ['/catalog/', '/new-order/']) { await page.goto(route); await expect(page).toHaveURL(/\/login\//); }
  await login(page, a);
  await expect(page.locator('#product-count')).toHaveText('10 of 10 products');
  await page.goto('/admin/'); await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await page.screenshot({ path: '.verification/catalog-desktop.png' });
  for (const inactive of baseline().filter(p => !p.is_active)) await expect(card(page, inactive)).toHaveCount(0);
  const search = page.getByLabel('Search products');
  await search.focus(); await page.keyboard.press('Tab');
  await expect(page.locator('#product-grid input').first()).toBeFocused();
  for (const term of ['PDP-DEMO-DATA-005', 'Demo Data 5 GB', '14 days']) {
    await search.fill(term); await expect(page.locator('#product-grid [data-product-id]:visible')).toHaveCount(1);
  }
  await search.fill('nothing matches this'); await expect(page.locator('#catalog-state')).toContainText('No products match');
  await search.fill('');
  const hidden = await page.evaluate(async ({ ids, url, key }) => {
    const entry = Object.entries(localStorage).find(([key]) => key.startsWith('sb-') && key.endsWith('-auth-token'));
    const session = JSON.parse(entry[1]);
    const response = await fetch(`${url}/rest/v1/products?select=id&id=in.(${ids.join(',')})`,
      { headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } });
    return { status: response.status, rows: await response.json() };
  }, { ids: baseline().filter(p => !p.is_active).map(p => p.id), url: config.VITE_SUPABASE_URL, key: config.VITE_SUPABASE_PUBLISHABLE_KEY });
  expect(hidden).toEqual({ status: 200, rows: [] });
  await add(page, credit(), 2); await add(page, data(), 3); await add(page, credit(), 1);
  await expect(counter(page)).toHaveText('2');
  for (const amount of ['0', '-1', '1.5', '1000', '1e2']) {
    await add(page, credit(), amount);
    await expect(card(page, credit()).getByLabel('Quantity', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect((await saved(page, a.id)).items.find(i => i.productId === credit().id).quantity).toBe(3);
  }
  await page.getByRole('link', { name: /View draft/ }).click();
  await expect(page.locator('#draft-total')).toHaveText('€35.25');
  await expect(page.locator('.draft-item')).toHaveCount(2);
  await page.reload(); await expect(page.locator('#draft-total')).toHaveText('€35.25');
  await expect(card(page, credit()).getByLabel('Quantity', { exact: true })).toHaveValue('3');
  const input = card(page, credit()).getByLabel('Quantity', { exact: true });
  for (const amount of ['0', '1.5', '1000']) {
    await input.fill(amount); await expect(page.locator('#draft-total')).toHaveText('Unavailable');
    expect((await saved(page, a.id)).items.find(i => i.productId === credit().id).quantity).toBe(3);
  }
  await input.fill('4'); await expect(page.locator('#draft-total')).toHaveText('€40.25');
  await expect(card(page, credit()).locator('.line-total')).toHaveText('€20.00');
  expect((await saved(page, a.id)).items.every(i => Object.keys(i).sort().join(',') === 'productId,quantity')).toBe(true);
  await card(page, data()).getByRole('button', { name: /Remove/ }).click();
  await expect(page.locator('#draft-total')).toHaveText('€20.00'); await expect(counter(page)).toHaveText('1');
  await page.getByRole('button', { name: 'Clear draft', exact: true }).click();
  await expect(page.locator('#empty-draft')).toBeVisible(); await expect(page.locator('#draft-total')).toHaveText('€0.00');
  await expect(page.getByRole('button', { name: /Submit/ })).toHaveCount(0);
});

test('API loading/failure/empty/retry, price revalidation, unavailable items and storage failures', async ({ page }) => {
  const a = accounts().a;
  await login(page, a);
  await page.route(api, route => route.abort()); await page.reload();
  await expect(page.locator('#catalog-state')).toContainText('Could not load products');
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(0);
  await page.unroute(api); await page.getByRole('button', { name: 'Retry products' }).click();
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await page.route(api, route => route.fulfill({ json: [] })); await page.reload();
  await expect(page.locator('#catalog-state')).toContainText('No active products'); await page.unroute(api);
  await page.reload(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('pdp:order-draft:')) throw new Error('quota'); return original.call(this, key, value); };
  });
  await add(page, credit(), 1); await expect(page.locator('#catalog-feedback')).toContainText('not saved');
  await expect(counter(page)).toHaveText('0'); await page.evaluate(() => window.restoreStorage());
  await seedDraft(page, a.id, [{ productId: credit().id, quantity: 2, unit_price: 0, name: 'FORGED' }]);
  await page.route(api, async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const response = await route.fetch(); const rows = await response.json();
    await route.fulfill({ response, json: rows.map(p => ({ ...p, unit_price: '7.25' })) });
  });
  await page.goto('/new-order/'); await expect(page.locator('#draft-state')).toContainText('Checking');
  await expect(page.locator('#draft-total')).toHaveText('€14.50');
  await expect(card(page, credit()).getByRole('heading')).toHaveText(credit().name);
  await page.unroute(api);
  await page.route(api, route => route.abort()); await page.reload();
  await expect(page.locator('#draft-state')).toContainText('Could not check');
  await expect(page.locator('#draft-total')).toHaveText('Unavailable');
  await page.unroute(api); await page.getByRole('button', { name: 'Retry product check' }).click();
  await expect(page.locator('#draft-total')).toHaveText('€10.00');
  await seedDraft(page, a.id, [{ productId: credit().id, quantity: 2 },
    { productId: baseline().find(p => !p.is_active).id, quantity: 3 },
    { productId: '00000000-0000-4000-8000-000000005bff', quantity: 1 }]);
  await page.reload(); await expect(page.locator('#draft-state')).toContainText('no longer available');
  await expect(page.locator('.draft-item')).toHaveCount(3); await expect(page.locator('#draft-total')).toHaveText('€10.00');
  await expect(page.locator('.draft-item input:disabled')).toHaveCount(2);
  await page.evaluate(key => localStorage.setItem(key, '{broken'), draftKey(a.id)); await page.reload();
  await expect(page.locator('#draft-state')).toContainText('could not be read');
  await page.getByRole('button', { name: 'Clear draft', exact: true }).click(); await expect(page.locator('#empty-draft')).toBeVisible();
  await page.route('**/rest/v1/profiles?**', async route => {
    const response = await route.fetch(); const rows = await response.json();
    await route.fulfill({ response, json: rows.map(p => ({ ...p, is_active: false })) });
  });
  await page.goto('/catalog/'); await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await expect(page.locator('#protected-content')).toBeHidden();
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(0);
  await page.unroute('**/rest/v1/profiles?**'); await page.reload();
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
});

test('account isolation, logout cleanup, cross-tab sync, admin guards and mobile layout', async ({ page, context }) => {
  const { a, b } = accounts();
  await login(page, a); await add(page, credit(), 2);
  await seedDraft(page, b.id, [{ productId: data().id, quantity: 7 }]);
  await page.goto('/new-order/'); await expect(page.locator('#draft-total')).toHaveText('€10.00');
  const second = await context.newPage(); await second.goto('/new-order/');
  await expect(second.locator('#draft-total')).toHaveText('€10.00');
  await card(second, credit()).getByLabel('Quantity', { exact: true }).fill('3');
  await expect(page.locator('#draft-total')).toHaveText('€15.00');
  await second.close();
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(/\/login\//);
  expect(await saved(page, a.id)).toBeNull();
  await login(page, b); await page.goto('/new-order/'); await expect(page.locator('#draft-total')).toHaveText('€47.25');
  await expect(card(page, credit())).toHaveCount(0); await expect(card(page, data()).getByLabel('Quantity', { exact: true })).toHaveValue('7');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.verification/draft-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Continue browsing' }).click(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.verification/catalog-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(/\/login\//);
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, state('.verification/demo-admin-candidate.json'), true);
  for (const route of ['/catalog/', '/new-order/']) {
    await page.goto(route); await expect(page).toHaveURL(/\/admin\//);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Admin dashboard', exact: true })).toBeVisible();
  }
});
