import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { draftKey } from '../src/draft/storage.js';
import { requestKey, makePayload } from '../src/orders/request.js';

test.skip(process.env.PDP_SESSION_UI_LIVE !== '1', 'Opt in to controlled real-account session races');
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const accounts = () => read('.verification/identity-live-state.json');
let pageErrors;
const tokenOwner = value => {
  try { return JSON.parse(Buffer.from(value.replace(/^Bearer /i, '').split('.')[1], 'base64url')).sub; }
  catch { return null; }
};
async function login(page, user) {
  await page.goto('/login/');
  await submitLogin(page, user);
}
async function submitLogin(page, user) {
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
}
test.beforeEach(async ({ context }) => {
  pageErrors = [];
  const watch = page => page.on('pageerror', error => pageErrors.push(error.message));
  context.pages().forEach(watch); context.on('page', watch);
  // No orders, direct database writes, Storage or privileged Auth operations.
  await context.route('**/rest/v1/**', route => {
    expect(route.request().method()).toBe('GET');
    return route.continue();
  });
});
test.afterEach(() => expect(pageErrors).toEqual([]));

for (const code of ['bad_jwt', 'session_not_found']) {
  test(`delayed ${code} for the previous identity cannot sign out a newer cross-tab login`, async ({ page, context }) => {
    const { a, b } = accounts();
    await login(page, a); await page.goto('/');
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
    const next = await context.newPage(); await next.goto('/catalog/');
    await expect(next.locator('#product-grid [data-product-id]')).toHaveCount(10);
    const items = [{ productId: read('.verification/session-before.json').data.products.find(p => p.is_active).id, quantity: 2 }];
    const pending = { version: 1, status: 'pending', payload: makePayload(items, 'Synthetic retained request'), orderId: null, draftResolved: false };
    const saved = { aDraft: draftKey(a.id), aRequest: requestKey(a.id), bDraft: draftKey(b.id), items, pending };
    await page.evaluate(s => {
      localStorage.setItem(s.aDraft, JSON.stringify({ version: 1, items: s.items }));
      localStorage.setItem(s.aRequest, JSON.stringify(s.pending));
      localStorage.setItem(s.bDraft, JSON.stringify({ version: 1, items: s.items }));
    }, saved);
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const waiting = new Promise(resolve => { started = resolve; });
    let hold = true;
    const logouts = [];
    context.on('request', r => { if (new URL(r.url()).pathname === '/auth/v1/logout') logouts.push(tokenOwner(r.headers().authorization ?? '')); });
    await page.route('**/auth/v1/user', async route => {
      if (!hold) return route.continue();
      hold = false; started(); await gate;
      await route.fulfill({ status: 401, headers: { 'x-supabase-api-version': '2024-01-01' }, json: { code, msg: 'Controlled stale identity rejection' } });
    });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await waiting;
    await next.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(next).toHaveURL(/\/login\//);
    await login(next, b); release();
    // Deliver an old queued sign-out notification after the new login.
    await next.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const channel = new BroadcastChannel(key); channel.postMessage({ event: 'SIGNED_OUT', session: null }); channel.close();
    });
    await page.waitForTimeout(300); // Let both the delayed response and deferred Auth callbacks settle.
    await next.reload(); await expect(next.locator('#product-grid [data-product-id]')).toHaveCount(10);
    expect(logouts).toEqual([a.id]);
    const preserved = await next.evaluate(s => ({ a: JSON.parse(localStorage.getItem(s.aDraft)), request: JSON.parse(localStorage.getItem(s.aRequest)), b: JSON.parse(localStorage.getItem(s.bDraft)) }), saved);
    expect(preserved).toEqual({ a: { version: 1, items }, request: pending, b: { version: 1, items } });
    await next.goto('/new-order/'); await expect(next.locator('#draft-items [data-product-id]')).toHaveCount(1);
    await next.close();
  });
}

test('a rejected stored identity fails closed but permits explicit reauthentication', async ({ page }) => {
  const user = accounts().a; await login(page, user);
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 401, json: { code: 'bad_jwt', msg: 'Controlled invalid stored session' } }));
  await page.goto('/login/');
  await expect(page.locator('#account-status')).toContainText('Please log in again');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.unroute('**/auth/v1/user');
  await submitLogin(page, user); await page.reload();
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
});

test('public Register creates one isolated account and opens its persistent workspace', async ({ page }) => {
  test.skip(process.env.PDP_REGISTER_LIVE !== '1', 'Separate opt-in: one controlled public-signup fixture per environment');
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const label = process.env.PDP_SESSION_NETLIFY === '1' ? 'netlify' : 'preview';
  const path = `.verification/session-register-${label}.json`;
  let fixture;
  if (existsSync(path)) fixture = read(path);
  else {
    const [local, domain] = accounts().b.email.split('@');
    fixture = { email: `${local.split('+')[0]}+session-${label}-${Date.now()}@${domain}`, password: `${randomBytes(24).toString('base64url')}aA1!` };
    writeFileSync(path, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  }
  const query = sql => JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--remote=niabpabsvdgxackjjcsb', '--read-only', '--', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).rows;
  const email = `'${fixture.email.replaceAll("'", "''")}'`;
  const existing = query(`SELECT id FROM auth.users WHERE email=${email}`);
  if (existing.length) {
    // Never repeat a successful signup, including a previous interrupted run.
    expect(existing).toHaveLength(1); fixture.id = existing[0].id;
    await login(page, fixture);
  } else {
    await page.goto('/register/');
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
    await page.getByLabel('Business name').fill(`Synthetic session ${label}`);
    await page.getByLabel('Contact name').fill('Synthetic session dealer');
    await page.getByLabel('Email address').fill(fixture.email);
    await page.getByLabel('Password', { exact: true }).fill(fixture.password);
    await page.getByLabel('Confirm password').fill(fixture.password);
    const signup = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/v1/signup');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const response = await signup; expect(response.status()).toBe(200);
    fixture.id = (await response.json()).user.id;
    writeFileSync(path, JSON.stringify(fixture, null, 2), { mode: 0o600 });
    await expect(page).toHaveURL(/\/catalog\//);
    await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  }
  const records = query(`SELECT u.id,p.dealer_id,p.is_active,r.role,d.is_active AS dealer_active,
    (SELECT count(*) FROM public.profiles sibling WHERE sibling.dealer_id=p.dealer_id) AS members
    FROM auth.users u JOIN public.profiles p ON p.id=u.id JOIN public.dealers d ON d.id=p.dealer_id
    JOIN public.user_roles r ON r.user_id=u.id WHERE u.email=${email}`);
  expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ id: fixture.id, is_active: true, role: 'dealer', dealer_active: true, members: 1 });
  fixture.dealerId = records[0].dealer_id;
  writeFileSync(path, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  await page.reload(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  await page.goto('/admin/'); await expect(page).toHaveURL(/\/catalog\//);
  await page.getByRole('button', { name: 'Log out', exact: true }).click(); await expect(page).toHaveURL(/\/login\//);
  await login(page, fixture);
  expect(consoleErrors).toEqual([]);
});
