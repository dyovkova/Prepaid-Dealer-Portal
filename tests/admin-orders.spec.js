import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { baseline, admin, dealer, inactive, stage, ledger, fixture, cards, joinedRow, login, openOrders, openDetails, change, ensureFixtures, externalProcessing, status, verifySnapshots } from './admin-order-support.js';
import { login as publicLogin, request, ok, denied } from '../supabase/verification/order_live_support.mjs';

test.skip(process.env.PDP_ADMIN_ORDERS_UI !== '1', 'Opt in: existing accounts, two preview/three Netlify synthetic orders; all pre-existing records preserved');
const ordersApi = '**/rest/v1/orders?**', rpcApi = '**/rest/v1/rpc/transition_order_status';
let errors, forbidden, writes, orderReads;
test.beforeEach(async ({ context }) => {
  errors = []; forbidden = []; writes = []; orderReads = 0;
  const watch = page => page.on('pageerror', error => errors.push(error.message)); context.pages().forEach(watch); context.on('page', watch);
  await context.route('**/rest/v1/**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname;
    if (r.method() === 'GET' && path === '/rest/v1/orders') orderReads += 1;
    if (path === '/rest/v1/products' && new URL(r.frame().url()).pathname === '/admin/orders/') forbidden.push('Current catalog lookup in history');
    if (r.method() !== 'GET') {
      const body = r.postDataJSON(); writes.push(body);
      if (path !== '/rest/v1/rpc/transition_order_status' || r.method() !== 'POST'
        || !ledger().fixtures.some(f => f.id === body.p_order_id && f.label.startsWith(stage() + '-'))
        || Object.keys(body).sort().join() !== 'p_expected_status,p_new_status,p_order_id') { forbidden.push(path); return route.abort(); }
    }
    await route.continue();
  });
});
test.afterEach(async ({}, info) => {
  expect(errors).toEqual([]); expect(forbidden).toEqual([]);
  writeFileSync(`.verification/10b-${stage()}-${info.testId.replace(/[^a-z0-9]/gi, '').slice(-16)}.json`, JSON.stringify({ test: info.title, status: info.status, errors, forbidden, writes }, null, 2));
});

test('real admin list/search/status/pagination, saved details, direct URLs, refresh and mobile', async ({ page }) => {
  await openOrders(page);
  const all = ok(await request('/rest/v1/orders?select=*', await publicLogin(admin())));
  await expect(cards(page)).toHaveCount(10); await expect(page.locator('#orders-page')).toContainText(`${all.length} orders`);
  await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(cards(page)).toHaveCount(all.length - 10);
  await expect(page).toHaveURL(/page=2/); await page.reload(); await expect(cards(page)).toHaveCount(all.length - 10);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click(); await expect(cards(page)).toHaveCount(10);
  const terminal = baseline().orders.find(o => o.status === 'completed'); expect(terminal).toBeTruthy();
  await page.getByLabel('Search orders', { exact: true }).fill(terminal.id); await page.getByRole('button', { name: 'Search orders', exact: true }).click();
  await expect(cards(page)).toHaveCount(1); await expect(cards(page)).toContainText(baseline().dealers.find(d => d.id === terminal.dealer_id).name);
  await page.getByLabel('Order status', { exact: true }).selectOption('submitted'); await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('#orders-state')).toContainText('No orders match');
  await page.getByLabel('Order status', { exact: true }).selectOption('all'); await expect(cards(page)).toHaveCount(1);
  await cards(page).getByRole('link').click(); await expect(page.locator('#order-content')).toBeVisible();
  await expect(page.locator('#order-reference')).toHaveText(terminal.id); await expect(page.locator('#status-actions button')).toHaveCount(0);
  await expect(page.locator('#status-help')).toContainText('terminal and read-only');
  const lines = baseline().items.filter(i => i.order_id === terminal.id), total = lines.reduce((n, i) => n + Number(i.unit_price_snapshot) * i.quantity, 0);
  await expect(page.locator('#order-total')).toHaveText(new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(total));
  for (const item of lines) { const row = page.locator(`#saved-items [data-product-id="${item.product_id}"]`); await expect(row.locator('h3')).toHaveText(item.name_snapshot); await expect(row.locator('.product-sku')).toContainText(item.sku_snapshot); }
  await page.reload(); await expect(page.locator('#order-reference')).toHaveText(terminal.id);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `.verification/admin-orders-details-${stage()}-${width}.png`, fullPage: true }); }
  await page.getByRole('link', { name: 'Back to orders', exact: true }).click(); await expect(cards(page)).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.verification/admin-orders-list-${stage()}-320.png`, fullPage: true });
  await page.getByLabel('Search orders', { exact: true }).fill('Synthetic'); await page.getByRole('button', { name: 'Search orders', exact: true }).click();
  await expect(cards(page).first()).toBeVisible(); for (const text of await cards(page).locator('[data-organization]').allTextContents()) expect(text.toLowerCase()).toContain('synthetic');
  await page.goto('/admin/orders/?id=invalid'); await expect(page.locator('#details-state')).toContainText('Invalid order link');
  await page.goto('/admin/orders/?id=00000000-0000-4000-8000-000000000099'); await expect(page.locator('#details-state')).toContainText('Order unavailable');
  expect(writes).toEqual([]);
});

test('API errors/empty/loading, safe text, PT409 reload without retry and uncertain mutations', async ({ page }) => {
  await login(page); let mode = 'failure', calls = 0, currentStatus = 'submitted';
  const row = joinedRow(baseline().orders[0]);
  await page.route(ordersApi, async route => {
    if (mode === 'failure') return route.fulfill({ status: 503, json: { message: 'Controlled outage' } });
    if (mode === 'empty') return route.fulfill({ json: [], headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' } });
    const data = { ...row, status: currentStatus, organization: { ...row.organization, name: '<img src=x onerror="window.badOrder=true">' } };
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: [data], headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' } });
  });
  await page.goto('/admin/orders/'); await expect(page.locator('#orders-state')).toContainText('Could not load');
  mode = 'empty'; await page.locator('#reload-orders').click(); await expect(page.locator('#orders-state')).toContainText('No orders match');
  mode = 'safe'; await page.locator('#reload-orders').click(); await expect(page.locator('#orders-state')).toContainText('Loading'); await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('<img'); await expect(page.locator('#admin-order-list img')).toHaveCount(0); expect(await page.evaluate(() => window.badOrder)).toBeUndefined();
  await cards(page).getByRole('link').click(); await expect(page.locator('#order-content')).toBeVisible();
  await change(page, 'Start processing', false); expect(calls).toBe(0);
  await page.route(rpcApi, async route => { calls += 1; currentStatus = 'processing'; await route.fulfill({ status: 409, json: { code: 'PT409', message: 'Order changed' } }); });
  await change(page, 'Start processing'); await expect(page.locator('#order-feedback')).toContainText('latest order is loaded');
  await expect(page.locator('#saved-status')).toHaveText('Processing'); expect(calls).toBe(1);
  await expect(page.locator('#status-actions').getByRole('button', { name: 'Complete order' })).toBeEnabled();
  await page.route(rpcApi, route => { calls += 1; return route.abort(); });
  await change(page, 'Complete order'); await expect(page.locator('#order-feedback')).toContainText('no automatic retry');
  await expect(page.locator('#saved-status')).toHaveText('Processing'); expect(calls).toBe(2);
  await page.route(rpcApi, async route => { calls += 1; mode = 'failure'; await route.fulfill({ status: 409, json: { code: 'PT409' } }); });
  await change(page, 'Reject order'); await expect(page.locator('#order-feedback')).toContainText('Use Reload order');
  await expect(page.locator('#order-content')).toBeHidden(); expect(calls).toBe(3); await expect(page.locator('#reload-order')).toBeEnabled();
  mode = 'safe'; await page.locator('#reload-order').click(); await expect(page.locator('#order-feedback')).toContainText('Order reloaded');
  await expect(page.locator('#status-actions').getByRole('button', { name: 'Complete order' })).toBeEnabled(); expect(calls).toBe(3);
});

test('anonymous/dealer/inactive routes, real API denials and unchanged shared guards', async ({ page }) => {
  await page.goto('/admin/orders/'); await expect(page).toHaveURL(/\/login\//);
  await login(page, dealer(), 'dealer'); await page.goto('/admin/orders/'); await expect(page).toHaveURL(/\/catalog\//);
  await page.goto('/admin/orders/?id=' + baseline().orders[0].id); await expect(page).toHaveURL(/\/catalog\//);
  const target = baseline().orders.find(o => o.status === 'completed');
  for (const token of [null, await publicLogin(dealer()), await publicLogin(inactive())]) {
    denied(await request('/rest/v1/rpc/transition_order_status', token, 'POST', { p_order_id: target.id, p_expected_status: 'completed', p_new_status: 'processing' }));
    denied(await request(`/rest/v1/orders?id=eq.${target.id}`, token, 'PATCH', { status: 'completed' }));
  }
  const inactiveToken = await publicLogin(inactive()); expect(ok(await request('/rest/v1/orders?select=id', inactiveToken))).toEqual([]);
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await login(page, inactive(), 'inactive');
  await page.goto('/admin/orders/'); await expect(page.locator('#account-status')).toContainText('Your account is inactive'); await expect(page.locator('#protected-content')).toBeHidden();
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await login(page);
  await page.goto('/order-details/?id=' + target.id); await expect(page).toHaveURL(/\/admin\//);
});

test('controlled real admin status changes, confirmation, duplicate clicks and genuine PT409 conflict', async ({ page }) => {
  await ensureFixtures(); await openOrders(page);
  const complete = fixture('complete'); await openDetails(page, complete.id);
  if (await status(complete) === 'submitted') {
    const before = writes.length; await change(page, 'Start processing', false); expect(writes.length).toBe(before);
    await page.getByRole('button', { name: 'Start processing', exact: true }).click();
    await page.locator('#order-confirm [value="confirm"]').evaluate(button => { button.click(); button.click(); });
    await expect(page.locator('#saved-status')).toHaveText('Processing'); await expect(page.locator('#reload-order')).toBeEnabled();
    expect(writes.length - before).toBe(1);
  }
  if (await status(complete) === 'processing') { await change(page, 'Complete order'); await expect(page.locator('#saved-status')).toHaveText('Completed'); }
  await expect(page.locator('#status-actions button')).toHaveCount(0); await page.reload(); await expect(page.locator('#saved-status')).toHaveText('Completed');
  const conflict = fixture('conflict'); await openDetails(page, conflict.id);
  if (await status(conflict) === 'submitted') {
    await externalProcessing(conflict); const before = writes.length;
    const response = page.waitForResponse(r => r.url().includes('/rpc/transition_order_status') && r.status() === 409);
    await change(page, 'Reject order'); expect((await (await response).json()).code).toBe('PT409');
    await expect(page.locator('#order-feedback')).toContainText('latest order is loaded'); await expect(page.locator('#saved-status')).toHaveText('Processing'); expect(writes.length - before).toBe(1);
  }
  if (await status(conflict) === 'processing') { await change(page, 'Reject order'); await expect(page.locator('#saved-status')).toHaveText('Rejected'); }
  if (stage() === 'netlify') {
    const reject = fixture('reject'); await openDetails(page, reject.id);
    if (await status(reject) === 'submitted') { await change(page, 'Reject order'); await expect(page.locator('#saved-status')).toHaveText('Rejected'); }
  }
  for (const body of writes) expect(Object.keys(body).sort()).toEqual(['p_expected_status', 'p_new_status', 'p_order_id']);
  await verifySnapshots();
});
