import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { admin, dealer, login, orderId } from './document-ui-support.js';

test.skip(process.env.PDP_VISUAL === undefined, 'Opt in: read-only real synthetic accounts; isolated browser drafts only');
const phase = process.env.PDP_VISUAL;
const baseline = phase === 'before';
const folder = `.verification/visual-${phase}`;
const widths = [1440, 390, 320];
let errors, consoleErrors, blocked, directDownloads, screens;
test.beforeEach(async ({ page }) => {
  mkdirSync(folder, { recursive: true });
  errors = []; consoleErrors = []; blocked = []; directDownloads = []; screens = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('503')) consoleErrors.push(message.text()); });
  await page.route('**/rest/v1/**', route => {
    if (route.request().method() !== 'GET') { blocked.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.route('**/storage/v1/**', route => { directDownloads.push(route.request().url()); return route.abort(); });
  await page.route('**/functions/v1/**', route => {
    if (!route.request().url().endsWith('/download-order-document')) { blocked.push('Unexpected Edge mutation'); return route.abort(); }
    return route.continue();
  });
});
test.afterEach(async ({}, info) => {
  writeFileSync(`${folder}/${info.title.split(' ')[0].replace(/[^a-z]/gi, '')}.json`, JSON.stringify({ status: info.status, errors, consoleErrors, blocked, directDownloads, screens }, null, 2));
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); expect(blocked).toEqual([]); expect(directDownloads).toEqual([]);
});
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0);
  await page.locator('input:focus, button:focus').evaluateAll(elements => elements.forEach(element => element.blur()));
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    const modal = await page.locator('dialog[open]').count() > 0;
    if (!modal) await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${folder}/${name}-${width}.png`, fullPage: !modal });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    screens.push({ name, width, overflow });
    if (!baseline) {
      expect(overflow, `${name} at ${width}px`).toBe(false);
      expect(await page.locator('.btn:visible, .navbar-toggler:visible').evaluateAll(elements => elements.every(el => el.getBoundingClientRect().height >= 43.5))).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 960 });
}
async function ready(page, path, selector) {
  await page.goto(path); await expect(page.locator(selector).first()).toBeVisible();
  await page.reload(); await expect(page.locator(selector).first()).toBeVisible();
  if (selector === '[data-auth-form]') await expect(page.locator('[data-auth-form] button[type="submit"]')).toBeEnabled();
  if (selector === '#order-content') {
    await expect(page.locator('#order-documents [data-reload]')).toBeEnabled();
    await expect(page.locator('#order-documents [data-state]')).not.toContainText('Loading');
  }
}
async function logout(page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login\//);
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
}
test('public routes, keyboard focus and mobile navigation', async ({ page }) => {
  for (const [name, path, selector] of [['home', '/', '.hero'], ['login', '/login/', '[data-auth-form]'], ['register', '/register/', '[data-auth-form]']]) {
    await ready(page, path, selector); await shot(page, name); await page.reload(); await expect(page.locator(selector)).toBeVisible();
  }
  await page.goto('/'); await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  if (!baseline) expect(await page.locator('.skip-link').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter'); await expect(page.locator('#main-content')).toBeFocused();
  await page.setViewportSize({ width: 320, height: 960 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click(); await expect(page.locator('#main-navigation')).toBeVisible();
  await page.locator('#main-navigation').getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/login\//);
});
test('dealer catalog, draft, history, snapshots and PDF controls', async ({ page }) => {
  await login(page, dealer(), 'dealer'); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await page.reload(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await shot(page, 'catalog');
  const first = page.locator('#product-grid [data-product-id]').first();
  await first.locator('input').fill('0'); await expect(first.locator('.invalid-feedback')).toBeVisible();
  await first.locator('input').fill('2'); await first.getByRole('button', { name: 'Add to draft' }).click();
  await page.getByLabel('Search products', { exact: true }).fill('no-such-demo-product');
  await expect(page.locator('#catalog-state')).toContainText('No products match'); await shot(page, 'catalog-empty');
  await ready(page, '/new-order/', '#draft-items .draft-item'); await shot(page, 'draft');
  await expect(page.locator('#submit-order')).toBeEnabled(); await page.reload(); await expect(page.locator('#draft-items input')).toHaveValue('2');
  await ready(page, '/my-orders/', '#order-list [data-order-id]'); await shot(page, 'history');
  await ready(page, `/order-details/?id=${orderId}`, '#order-content'); await shot(page, 'dealer-details');
  await page.reload(); await expect(page.locator('#order-documents [data-download]').first()).toBeEnabled();
  const download = page.waitForEvent('download'); await page.locator('#order-documents [data-download]').first().click(); expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.goto('/admin/'); await expect(page).toHaveURL(/\/catalog\//);
});
test('admin routes, editors, filters, confirmations and document controls', async ({ page }) => {
  await login(page, admin(), 'admin'); await page.reload(); await expect(page.getByRole('heading', { name: 'Admin dashboard', exact: true })).toBeVisible(); await shot(page, 'dashboard');
  await ready(page, '/admin/products/', '#admin-product-grid [data-product-id]'); await shot(page, 'products');
  await page.locator('#new-product').click(); await expect(page.locator('#product-editor')).toBeVisible(); await shot(page, 'product-editor');
  await page.locator('#product-editor [data-cancel]').click();
  await page.locator('#admin-product-grid [data-action="status"]').first().click(); await expect(page.locator('#product-confirm')).toBeVisible(); await shot(page, 'product-confirm');
  await page.locator('#product-confirm [value="cancel"]').click();
  await ready(page, '/admin/dealers/', '#organization-grid [data-organization-id]'); await shot(page, 'dealers');
  await page.locator('#new-organization').click(); await expect(page.locator('#organization-editor')).toBeVisible(); await shot(page, 'organization-editor');
  await page.locator('#organization-editor [data-cancel]').click();
  await page.locator('#organization-search').fill('no-such-demo-organization'); await expect(page.locator('#organizations-empty')).toBeVisible();
  await ready(page, '/admin/orders/', '#admin-order-list [data-order-id]'); await shot(page, 'admin-orders');
  await page.locator('#order-filter').selectOption('completed'); await page.getByRole('button', { name: 'Search orders', exact: true }).click();
  await expect(page.locator('#orders-page')).not.toBeEmpty();
  await page.locator('#order-filter').selectOption('submitted'); await page.getByRole('button', { name: 'Search orders', exact: true }).click();
  await expect(page.locator('#admin-order-list .badge').first()).toHaveText('Submitted');
  await page.locator('#admin-order-list a').first().click();
  await expect(page.getByRole('button', { name: 'Start processing', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start processing', exact: true }).click();
  await expect(page.locator('#order-confirm')).toBeVisible(); await shot(page, 'order-confirm');
  await page.keyboard.press('Escape'); await expect(page.locator('#order-confirm')).not.toBeVisible();
  await ready(page, `/admin/orders/?id=${orderId}`, '#order-content'); await shot(page, 'admin-details');
  await expect(page.locator('#document-file')).toBeEnabled();
  await page.locator('#document-file').setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic invalid selection') });
  await page.locator('#order-documents [data-submit]').click(); await expect(page.locator('#order-documents [data-feedback]')).toBeVisible(); await shot(page, 'pdf-validation');
  await page.reload(); await expect(page.locator('#order-documents [data-reload]')).toBeEnabled();
  await expect(page.locator('#status-actions button')).toHaveCount(0);
  await page.goto('/catalog/'); await expect(page).toHaveURL(/\/admin\/(?:\?|$)/);
});

test('feedback, unavailable orders and document recovery stay usable', async ({ page }) => {
  await page.goto('/register/'); await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('#form-feedback')).toBeVisible(); await shot(page, 'form-validation');
  await login(page, dealer(), 'dealer');
  await ready(page, '/new-order/', '#empty-draft'); await shot(page, 'empty-draft');
  await ready(page, '/order-details/?id=invalid', '#details-state'); await shot(page, 'invalid-order');
  await page.route('**/rest/v1/products?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Synthetic visual test outage"}' }));
  await page.goto('/catalog/'); await expect(page.locator('#retry-products')).toBeVisible(); await shot(page, 'catalog-error');
  await page.unroute('**/rest/v1/products?**');
  await logout(page);
  await login(page, admin(), 'admin');
  const key = `pdp:document-upload:v1:niabpabsvdgxackjjcsb:${admin().id}:${orderId}`;
  // An isolated browser-only unresolved intent. No file is uploaded or published.
  const record = JSON.stringify({ version: 1, id: 'aca92ada-a635-4896-bbc7-a95c211bcf24', orderId, fileName: 'Synthetic saved request.pdf', size: 123, digest: 'a'.repeat(64), phase: 'uploaded' });
  await page.evaluate(({ key, record }) => localStorage.setItem(key, record), { key, record });
  await ready(page, `/admin/orders/?id=${orderId}`, '#order-content'); await shot(page, 'pdf-recovery');
  await expect(page.locator('#order-documents [data-submit]')).toHaveText('Retry saved PDF');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(record);
  await logout(page); await login(page, dealer(), 'dealer');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(record);
  await page.goto(`/order-details/?id=${orderId}`); await expect(page.locator('#order-documents [data-upload]')).toHaveCount(0);
});
