import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';

test.skip(process.env.PDP_AUTH_UI_LIVE !== '1', 'Opt in with PDP_AUTH_UI_LIVE=1; this creates one synthetic public-signup fixture.');
const fixturePath = '.verification/auth-ui-fixture.json';
const displayName = 'Synthetic UI Dealer';
const businessName = 'Synthetic UI Organization 4B';
const env = loadEnv('production', process.cwd(), 'VITE_');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(statement, write = false) {
  try {
    const result = execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query',
      '--remote=niabpabsvdgxackjjcsb', ...(write ? ['--yes'] : ['--read-only']), '--', statement],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(result).rows;
  } catch { throw new Error('Trusted fixture verification failed; credentials are not included in this report.'); }
}
function fixture() {
  if (existsSync(fixturePath)) return JSON.parse(readFileSync(fixturePath, 'utf8'));
  const previous = JSON.parse(readFileSync('.verification/identity-live-state.json', 'utf8'));
  const [name, host] = previous.b.email.split('@');
  const value = { email: process.env.PDP_UI_TEST_EMAIL ?? `${name.split('+')[0]}+portal4b-${Date.now()}@${host}`,
    password: `${randomBytes(24).toString('base64url')}aA1!` };
  mkdirSync('.verification', { recursive: true });
  writeFileSync(fixturePath, JSON.stringify(value, null, 2), { mode: 0o600 });
  return value;
}
async function login(page, account) {
  await page.goto('/login/');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

test('real multi-page registration, sessions, role guards and inactive feedback', async ({ page, browser }) => {
  const account = fixture();
  const errors = [];
  const businessRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/rest\/v1\/(products|orders|order_items)|\/storage\/v1/.test(request.url())) businessRequests.push(request.url()); });
  expect(env.VITE_SUPABASE_URL).toBe('https://niabpabsvdgxackjjcsb.supabase.co');
  expect(env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')).toBe(true);
  const settings = await page.request.get(`${env.VITE_SUPABASE_URL}/auth/v1/settings`,
    { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY } });
  expect((await settings.json()).mailer_autoconfirm).toBe(true);
  for (const route of ['/catalog/', '/new-order/', '/my-orders/', '/order-details/', '/admin/']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\//);
    await expect(page.locator('#account-status')).toContainText('Please log in');
  }
  console.log('PASS anonymous direct navigation to all five protected pages');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#form-feedback')).toContainText('highlighted fields');
  const prior = JSON.parse(readFileSync('.verification/identity-live-state.json', 'utf8')).b;
  await page.getByLabel('Email address').fill(prior.email);
  await page.getByLabel('Password', { exact: true }).fill(`${prior.password}-incorrect`);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#form-feedback')).toContainText('Email or password is incorrect');
  console.log('PASS validation and invalid credentials');

  await page.goto('/register/');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeEnabled();
  if (!account.id) {
    const existing = sql(`SELECT id FROM auth.users WHERE email=${literal(account.email)}`);
    expect(existing.length, 'New test address must not overwrite an existing user').toBe(0);
    await page.getByLabel('Business name').fill(businessName);
    await page.getByLabel('Contact name').fill(displayName);
    await page.getByLabel('Email address').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password').fill('different-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#form-feedback')).toContainText('highlighted fields');
    await page.getByLabel('Confirm password').fill(account.password);
    const signup = page.waitForResponse(response => response.url().endsWith('/auth/v1/signup') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Create account' }).click();
    const response = await signup;
    expect(response.ok()).toBe(true);
    account.id = (await response.json()).user.id;
    writeFileSync(fixturePath, JSON.stringify(account, null, 2), { mode: 0o600 });
  } else await login(page, account);
  await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#protected-content')).toBeVisible();
  await expect(page.locator('#account-status')).toContainText(displayName);
  const rows = sql(`SELECT p.id,p.dealer_id,p.is_active,r.role,d.is_active AS organization_active
    FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id JOIN public.dealers d ON d.id=p.dealer_id
    WHERE p.id=${literal(account.id)}::uuid`);
  expect(rows.length).toBe(1);
  expect(rows[0].role).toBe('dealer'); expect(rows[0].is_active).toBe(true); expect(rows[0].organization_active).toBe(true);
  account.dealerId = rows[0].dealer_id;
  writeFileSync(fixturePath, JSON.stringify(account, null, 2), { mode: 0o600 });
  const guard = `u.id=${literal(account.id)}::uuid AND u.email=${literal(account.email)} AND u.raw_user_meta_data->>'display_name'=${literal(displayName)}`;
  const change = (target, value) => {
    const query = target === 'role'
      ? `UPDATE public.user_roles r SET role=${literal(value)} FROM auth.users u WHERE r.user_id=u.id AND ${guard} RETURNING r.user_id`
      : target === 'profile'
        ? `UPDATE public.profiles p SET is_active=${value} FROM auth.users u WHERE p.id=u.id AND ${guard} RETURNING p.id`
        : `UPDATE public.dealers d SET is_active=${value} FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE d.id=p.dealer_id AND ${guard} RETURNING d.id`;
    expect(sql(query, true).length, 'Only the newly registered fixture may be changed').toBe(1);
  };
  try {
    for (const route of ['/catalog/', '/new-order/', '/my-orders/', '/order-details/?id=demo']) {
      await page.goto(route); await expect(page.locator('#protected-content')).toBeVisible();
      await page.reload(); await expect(page.locator('#protected-content')).toBeVisible();
    }
    await page.goto('/admin/');
    await expect(page).toHaveURL(/\/catalog\//);
    await expect(page.locator('#account-status')).toContainText('restricted');
    await expect(page.locator('nav[aria-label="Main navigation"]').getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    const denied = await page.evaluate(async ({ url, key, other }) => {
      const entry = Object.entries(localStorage).find(([name]) => name.startsWith('sb-') && name.endsWith('-auth-token'));
      const token = JSON.parse(entry[1]).access_token;
      const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const read = await fetch(`${url}/rest/v1/profiles?id=eq.${other}&select=id`, { headers });
      const write = await fetch(`${url}/rest/v1/user_roles?user_id=neq.00000000-0000-0000-0000-000000000000`,
        { method: 'PATCH', headers, body: JSON.stringify({ role: 'admin' }) });
      return { visible: (await read.json()).length, status: write.status, code: (await write.json()).code };
    }, { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY, other: prior.id });
    expect(denied).toEqual({ visible: 0, status: 403, code: '42501' });
    console.log('PASS signup provisioning, persistent refresh, dealer routes and admin/server denials');

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login\//);
    await expect(page.locator('#account-status')).toContainText('You have been logged out');
    await page.reload(); await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
    await page.goto('/catalog/'); await expect(page).toHaveURL(/\/login\//);
    await login(page, prior); await expect(page).toHaveURL(/\/catalog\//);
    await expect(page.locator('nav[aria-label="Main navigation"]').getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login\//);
    await login(page, account); await expect(page).toHaveURL(/\/catalog\//);
    console.log('PASS logout and forged-metadata dealer login');

    change('profile', false);
    await page.reload(); await expect(page.locator('#account-status')).toContainText('Your account is inactive');
    await expect(page.locator('#protected-content')).toBeHidden();
    await page.getByRole('button', { name: 'Log out' }).click(); await expect(page).toHaveURL(/\/login\//);
    await login(page, account);
    await expect(page.locator('#account-status')).toContainText('Your account is inactive');
    await expect(page.locator('[data-auth-form]')).toBeHidden();
    change('profile', true);
    await page.getByRole('button', { name: 'Check account again' }).click(); await expect(page).toHaveURL(/\/catalog\//);
    change('organization', false);
    await page.reload(); await expect(page.locator('#account-status')).toContainText('organization is inactive');
    change('organization', true);
    await page.getByRole('button', { name: 'Check account again' }).click(); await expect(page.locator('#protected-content')).toBeVisible();
    console.log('PASS inactive profile and organization feedback with recovery');

    change('role', 'admin');
    await page.reload(); await expect(page).toHaveURL(/\/admin\//); await expect(page.locator('#protected-content')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click(); await expect(page).toHaveURL(/\/login\//);
    await login(page, account); await expect(page).toHaveURL(/\/admin\//);
    await page.reload(); await expect(page.getByRole('heading', { name: 'Admin dashboard', exact: true })).toBeVisible();
    await page.goto('/order-details/?id=demo'); await expect(page).toHaveURL(/\/admin\//);
    await page.goto('/catalog/'); await expect(page).toHaveURL(/\/admin\//);
    change('role', 'dealer');
    await page.reload(); await expect(page).toHaveURL(/\/catalog\//);
    console.log('PASS database-admin login destination, refresh and dealer-only guards; role restored');

    await page.route('**/rest/v1/profiles?**', route => route.abort());
    await page.reload(); await expect(page.locator('#account-status')).toContainText('Check your connection');
    await expect(page.locator('#protected-content')).toBeHidden();
    await page.unroute('**/rest/v1/profiles?**');
    await page.getByRole('button', { name: 'Check account again' }).click(); await expect(page.locator('#protected-content')).toBeVisible();
    expect(businessRequests.length).toBe(0); expect(errors).toEqual([]);
    console.log('PASS account-fetch failure closes access and retry recovers; no business APIs queried');
  } finally {
    change('profile', true); change('organization', true); change('role', 'dealer');
  }

  const clean = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await clean.newPage();
  for (const route of ['/login/', '/register/']) {
    await mobile.goto(`http://127.0.0.1:4173${route}`);
    await expect(mobile.locator('fieldset')).toBeEnabled();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mobile.screenshot({ path: `.verification/auth-${route.includes('register') ? 'register' : 'login'}-mobile.png`, fullPage: true });
  }
  await mobile.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(mobile.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute('aria-expanded', 'true');
  await clean.close();
  console.log('PASS mobile login/register layouts and collapsed navigation');
});

test('desktop keyboard navigation and cross-tab logout', async ({ page }) => {
  const account = fixture();
  expect(Boolean(account.id)).toBe(true);
  for (const route of ['/login/', '/register/']) {
    await page.goto(route); await expect(page.locator('fieldset')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.verification/auth-${route.includes('register') ? 'register' : 'login'}-desktop.png`, fullPage: true });
  }
  await page.goto('/login/'); await expect(page.locator('fieldset')).toBeEnabled();
  await page.getByLabel('Email address').focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeFocused();
  await login(page, account); await expect(page).toHaveURL(/\/catalog\//);
  const second = await page.context().newPage();
  await second.goto('/catalog/'); await expect(second.locator('#protected-content')).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login\//); await expect(second).toHaveURL(/\/login\//);
  await second.reload(); await expect(second).toHaveURL(/\/login\//);
  await second.close();
  console.log('PASS desktop forms, keyboard order and logout propagation across tabs');
});
