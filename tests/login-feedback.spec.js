import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.skip(process.env.PDP_SESSION_UI_LIVE !== '1', 'Opt in: existing synthetic logins only; no database writes');
test.setTimeout(90000);
const read = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const dealer = () => read('.verification/identity-live-state.json').a;

test.beforeEach(async ({ context }) => {
  await context.route('**/rest/v1/**', route => {
    expect(route.request().method()).toBe('GET');
    return route.continue();
  });
});

async function fill(page, user) {
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
}

async function watchFeedback(page, samples) {
  await page.exposeFunction('recordLoginFeedback', sample => samples.push(sample));
  await page.evaluate(() => {
    let previous = '', started = false;
    function sample() {
      const form = document.querySelector('[data-auth-form]');
      if (!form) return;
      started ||= form.getAttribute('aria-busy') === 'true';
      const errors = [...document.querySelectorAll('.alert-danger, .invalid-feedback')]
        .filter(node => node.checkVisibility()).map(node => node.textContent);
      const state = { errors, busy: form.getAttribute('aria-busy'), disabled: form.querySelector('fieldset').disabled,
        invalid: form.classList.contains('was-validated'), feedback: document.querySelector('#form-feedback').textContent,
        fits: document.documentElement.scrollWidth <= innerWidth };
      const json = JSON.stringify(state);
      if (started && json !== previous) { previous = json; window.recordLoginFeedback(state); }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

async function holdWorkspace(page, path) {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const pending = new Promise(resolve => { started = resolve; });
  await page.route(`**${path}**`, async route => {
    if (route.request().isNavigationRequest()) { started(); await gate; }
    await route.continue();
  });
  return { pending, release };
}

for (const width of [1440, 390, 320]) {
  test(`login has no validation flash or duplicate request through navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login/');
    const user = dealer();
    await fill(page, { ...user, password: `${user.password}-incorrect` });
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('#form-feedback')).toContainText('Email or password is incorrect');
    await expect(page).toHaveURL(/\/login\//);
    await fill(page, user);
    const workspace = await holdWorkspace(page, '/catalog/');
    const samples = [], statuses = [];
    page.on('response', r => { if (new URL(r.url()).pathname === '/auth/v1/token') statuses.push(r.status()); });
    await watchFeedback(page, samples);
    await page.locator('form').evaluate(form => {
      form.addEventListener('submit', () => queueMicrotask(() => {
        form.requestSubmit(); form.requestSubmit();
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      }), { once: true });
    });
    const submitted = page.getByRole('button', { name: 'Log in', exact: true }).click({ noWaitAfter: true });
    await workspace.pending;
    await expect.poll(() => samples.at(-1)).toEqual({ errors: [], busy: 'true', disabled: true,
      invalid: false, feedback: 'Login successful. Opening your workspace…', fits: true });
    expect(statuses).toEqual([200]);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every(s => s.errors.length === 0 && s.busy === 'true' && s.disabled)).toBe(true);
    workspace.release();
    await submitted;
    await expect(page).toHaveURL(/\/catalog\//);
    await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
    await page.reload(); await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
    if (!await page.getByRole('button', { name: 'Log out', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/\/login\//);
    await fill(page, user); await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\//);
  });
}

test('inactive and administrator logins keep database-derived access restrictions', async ({ page }) => {
  await page.goto('/login/');
  await fill(page, read('.verification/session-register-preview.json'));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await expect(page.locator('[data-auth-form]')).toBeHidden();
  await page.goto('/catalog/'); await expect(page.locator('#protected-content')).toBeHidden();
  await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login\//);
  await fill(page, read('.verification/demo-admin-candidate.json'));
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\//);
  await expect(page.locator('#account-status')).toHaveText('Signed in as Demo Administrator.');
  await page.reload(); await expect(page.locator('#protected-content')).toBeVisible();
  await page.goto('/catalog/'); await expect(page).toHaveURL(/\/admin\//);
});

test('a stale background identity rejection cannot overwrite an explicit successful login', async ({ page }) => {
  await page.goto('/login/'); await fill(page, dealer());
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#protected-content')).toBeVisible();
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 401, json: { code: 'bad_jwt' } }));
  await page.goto('/login/'); await expect(page.locator('#account-status')).toContainText('Please log in again');
  await page.unroute('**/auth/v1/user');
  let release, started, first = true;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  await page.route('**/auth/v1/user', async route => {
    if (!first) return route.continue();
    first = false; started(); await gate;
    await route.fulfill({ status: 401, json: { code: 'bad_jwt' } });
  });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await waiting; await fill(page, dealer());
  const workspace = await holdWorkspace(page, '/catalog/');
  const samples = [];
  await watchFeedback(page, samples);
  const submitted = page.getByRole('button', { name: 'Log in', exact: true }).click({ noWaitAfter: true });
  await workspace.pending;
  const rejected = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/v1/user' && r.status() === 401);
  release(); await (await rejected).finished();
  workspace.release(); await submitted; await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(s => s.errors.length === 0 && s.busy === 'true' && s.disabled)).toBe(true);
});
