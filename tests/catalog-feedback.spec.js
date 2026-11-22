import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dealer, other, login, switchTo } from './document-ui-support.js';
import { draftKey } from '../src/draft/storage.js';
import { makePayload, requestKey } from '../src/orders/request.js';

test.skip(process.env.PDP_CATALOG_FEEDBACK !== '1', 'Opt in: real synthetic logins, isolated browser drafts; no database/file writes');
const stage = process.env.PDP_CATALOG_FEEDBACK_NETLIFY === '1' ? 'netlify' : 'preview';
const toast = page => page.locator('[data-draft-toast]');
const indicator = card => card.locator('[data-draft-indicator]');
const button = card => card.getByRole('button', { name: 'Add to draft', exact: true });
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey(dealer().id));
let errors, forbidden;
test.beforeEach(async ({ page, context }) => {
  errors = []; forbidden = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/rest/v1/**', route => {
    if (route.request().method() !== 'GET') { forbidden.push('database mutation'); return route.abort(); }
    return route.continue();
  });
  for (const pattern of ['**/storage/v1/**', '**/functions/v1/**']) await context.route(pattern, route => { forbidden.push('out-of-scope request'); return route.abort(); });
  await login(page, dealer(), 'dealer'); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
});
test.afterEach(async ({}, info) => {
  writeFileSync(`.verification/catalog-feedback-${stage}-${info.title.split(' ')[0]}.json`, JSON.stringify({ status: info.status, errors, forbidden }, null, 2));
  expect(errors).toEqual([]); expect(forbidden).toEqual([]);
});
async function add(card, amount = '2') { await card.getByLabel('Quantity', { exact: true }).fill(amount); await button(card).click(); }
async function inViewport(page) {
  const box = await toast(page).boundingBox(), size = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('adding below the fold, repeated clicks, keyboard action and refresh use one saved line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const card = page.locator('#product-grid [data-product-id]').last();
  const id = await card.getAttribute('data-product-id');
  const buttonTop = await button(card).evaluate(el => el.getBoundingClientRect().top + scrollY);
  await add(card); expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
  expect(await button(card).evaluate(el => el.getBoundingClientRect().top + scrollY)).toBeCloseTo(buttonTop, 0);
  await expect(toast(page).locator('[data-toast-title]')).toHaveText('Product added to draft'); await inViewport(page);
  await page.screenshot({ path: `.verification/catalog-feedback-${stage}-desktop.png` });
  await expect(indicator(card)).toHaveText('Added to draft · 2 units');
  await expect(button(card)).toBeFocused();
  await button(card).click(); await expect(toast(page)).toContainText('Quantity updated');
  await button(card).dblclick();
  expect((await saved(page)).items).toEqual([{ productId: id, quantity: 8 }]);
  await expect(indicator(card)).toHaveText('Added to draft · 8 units');
  await expect(page.locator('[data-draft-count]')).toHaveText(['1', '1']);
  await expect(page.locator('[data-draft-announcement]')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-draft-announcement]')).toContainText('8 units in draft');
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Dismiss draft notification' })).toBeFocused(); await page.keyboard.press('Enter');
  await expect(toast(page)).toBeHidden(); await expect(button(card)).toBeFocused();
  await page.reload(); await expect(page.locator(`[data-product-id="${id}"] [data-draft-indicator]`)).toHaveText('Added to draft · 8 units');
  await expect(toast(page)).toBeHidden();
  await add(page.locator(`[data-product-id="${id}"]`), '1');
  await page.getByLabel('Search products', { exact: true }).fill('no matching synthetic product');
  await page.getByRole('button', { name: 'Dismiss draft notification' }).click();
  await expect(page.getByLabel('Search products', { exact: true })).toBeFocused();
  await page.getByLabel('Search products', { exact: true }).fill('');
  await add(page.locator(`[data-product-id="${id}"]`), '1');
  await toast(page).getByRole('link', { name: 'View draft', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/new-order\//); await expect(page.locator('#draft-items input')).toHaveValue('10');
});
test('removal, clearing and account switching synchronize actual card state and counters', async ({ page, context }) => {
  const cards = page.locator('#product-grid [data-product-id]');
  await add(cards.nth(0), '2'); await page.getByRole('button', { name: 'Dismiss draft notification' }).click();
  await add(cards.nth(1), '3');
  const ids = (await saved(page)).items.map(item => item.productId);
  const second = await context.newPage(); await second.goto('/new-order/');
  await expect(second.locator('#draft-items .draft-item')).toHaveCount(2);
  await second.locator(`[data-product-id="${ids[0]}"] [data-remove]`).click();
  await expect(page.locator(`[data-product-id="${ids[0]}"] [data-draft-indicator]`)).toBeHidden();
  await expect(page.locator(`[data-product-id="${ids[1]}"] [data-draft-indicator]`)).toHaveText('Added to draft · 3 units');
  await expect(page.locator('[data-draft-count]')).toHaveText(['1', '1']); await expect(toast(page)).toBeHidden();
  await second.getByRole('button', { name: 'Clear draft', exact: true }).click();
  await expect(page.locator('[data-draft-indicator]:visible')).toHaveCount(0); await expect(page.locator('[data-draft-count]')).toHaveText(['0', '0']);
  await second.close(); await add(cards.nth(0), '2');
  await switchTo(page, other()); await expect(page.locator('[data-account-name]')).toHaveText('Synthetic Dealer B');
  await expect(cards).toHaveCount(10); await expect(page.locator('[data-draft-indicator]:visible')).toHaveCount(0); await expect(toast(page)).toBeHidden();
  await expect(page.locator('[data-draft-count]').first()).toHaveText('0');
  await switchTo(page, dealer()); await expect(page.locator(`[data-product-id="${ids[0]}"] [data-draft-indicator]`)).toHaveText('Added to draft · 2 units');
  await page.reload(); await expect(page.locator(`[data-product-id="${ids[0]}"] [data-draft-indicator]`)).toHaveText('Added to draft · 2 units');
});
test('invalid quantities, limits and storage failures never announce a false success; mobile fits', async ({ page }) => {
  const card = page.locator('#product-grid [data-product-id]').last();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await add(card, '1');
    await expect(toast(page)).toBeVisible(); await inViewport(page);
    await page.screenshot({ path: `.verification/catalog-feedback-${stage}-${width}.png` });
    await page.getByRole('button', { name: 'Dismiss draft notification' }).click();
  }
  const previous = await saved(page);
  await add(card, '0'); await expect(card.locator('.invalid-feedback')).toBeVisible(); await expect(toast(page)).toBeHidden();
  await add(card, '999'); await expect(toast(page).locator('[data-toast-title]')).toHaveText('Draft update not confirmed');
  expect(await saved(page)).toEqual(previous); await expect(indicator(card)).toHaveText('Added to draft · 2 units');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreDraftStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('pdp:order-draft:')) throw new Error('Synthetic quota'); return original.call(this, key, value); };
  });
  const fresh = page.locator('#product-grid [data-product-id]').first(); await add(fresh, '1');
  await expect(toast(page).locator('[data-toast-title]')).toHaveText('Draft update not confirmed'); await expect(toast(page)).toContainText('not saved');
  await expect(indicator(fresh)).toBeHidden(); expect(await saved(page)).toEqual(previous);
  await expect(page.locator('[data-draft-announcement]')).not.toContainText('Product added to draft');
  await page.evaluate(() => window.restoreDraftStorage());
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreDraftStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) { if (!key.startsWith('pdp:order-draft:')) return original.call(this, key, value); };
  });
  await add(fresh, '1'); await expect(toast(page)).toContainText('changed before confirmation');
  await expect(indicator(fresh)).toBeHidden(); expect(await saved(page)).toEqual(previous);
  await page.evaluate(() => window.restoreDraftStorage());
  const pending = { version: 1, status: 'pending', payload: makePayload(previous.items), orderId: null, draftResolved: false };
  await page.evaluate(({ key, value }) => { localStorage.setItem(key, value); window.dispatchEvent(new StorageEvent('storage', { key })); }, { key: requestKey(dealer().id), value: JSON.stringify(pending) });
  await expect(button(card)).toBeDisabled(); await expect(toast(page)).toBeHidden();
  await expect(indicator(card)).toHaveText('Added to draft · 2 units'); expect(await saved(page)).toEqual(previous);
  await page.evaluate(key => { localStorage.removeItem(key); window.dispatchEvent(new StorageEvent('storage', { key })); }, requestKey(dealer().id));
  await page.evaluate(key => { localStorage.setItem(key, '{broken'); window.dispatchEvent(new StorageEvent('storage', { key })); }, draftKey(dealer().id));
  await expect(page.locator('[data-draft-indicator]:visible')).toHaveCount(0); await expect(toast(page)).toBeHidden();
  await expect(page.locator('[data-draft-count]').first()).toHaveText('—');
});
