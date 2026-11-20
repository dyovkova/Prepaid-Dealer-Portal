// Opt-in hosted SQL and public Auth/Data API tests. Reuses controlled demo users.
// Never creates users, promotes roles, applies migrations or imports seeds.
// Fixture activation changes are bounded, restored in finally and checked below.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadEnv } from 'vite';

assert.equal(process.env.PDP_CATALOG_LIVE_TESTS, '1', 'Opt in with PDP_CATALOG_LIVE_TESTS=1; controlled fixture activation is temporarily changed');
const project = 'niabpabsvdgxackjjcsb';
const origin = `https://${project}.supabase.co`;
const env = loadEnv('production', process.cwd(), 'VITE_');
assert.equal(env.VITE_SUPABASE_URL, origin);
assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Use public configuration only');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const state = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const cli = args => {
  try {
    return JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }));
  } catch { throw new Error('Trusted CLI verification failed; no credentials are logged'); }
};
const query = (statement, write = false) => cli(['db', 'query', `--remote=${project}`,
  ...(write ? ['--yes'] : ['--read-only']), '--', statement]).rows;
const snapshot = () => query(`SELECT json_build_object(
  'auth',(SELECT json_agg(json_build_object('id',id,'email',email,'confirmed',email_confirmed_at) ORDER BY id) FROM auth.users),
  'profiles',(SELECT json_agg(row_to_json(p) ORDER BY id) FROM public.profiles p),
  'dealers',(SELECT json_agg(row_to_json(d) ORDER BY id) FROM public.dealers d),
  'roles',(SELECT json_agg(row_to_json(r) ORDER BY user_id) FROM public.user_roles r),
  'products',(SELECT json_agg(row_to_json(p) ORDER BY sku) FROM public.products p),
  'history',(SELECT json_agg(row_to_json(m) ORDER BY version) FROM supabase_migrations.schema_migrations m),
  'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items)) AS data`)[0].data;
const request = async (path, token, method = 'GET', body) => {
  const response = await fetch(`${origin}${path}`, { method, signal: AbortSignal.timeout(20000),
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};
const ok = result => {
  assert.ok(result.status >= 200 && result.status < 300,
    `Expected API success, got ${result.status}/${result.body?.code ?? result.body?.error_code ?? 'unknown'}`);
  return result.body;
};
const denied = result => {
  assert.ok([401, 403].includes(result.status)); assert.equal(result.body?.code, '42501');
};
const report = { project, passed: [], completed: false };
mkdirSync('.verification', { recursive: true });
const save = () => writeFileSync('.verification/catalog-live-results.json', JSON.stringify(report, null, 2), { mode: 0o600 });
const passed = message => { report.passed.push(message); save(); console.log(`PASS ${message}`); };
const fixtures = state('.verification/identity-live-state.json');
const dealers = [fixtures.a, fixtures.b, state('.verification/auth-ui-fixture.json')];
const admin = state('.verification/demo-admin-candidate.json');
const activationFixture = dealers[0];
const fixtureGuard = `u.id=${literal(activationFixture.id)}::uuid AND u.email=${literal(activationFixture.email)}
  AND u.raw_user_meta_data->>'test_fixture'='milestone4a' AND r.role='dealer'`;
let restoreProfile = false;
let restoreOrganization = false;
const activation = (organization, active) => {
  const statement = organization
    ? `UPDATE public.dealers d SET is_active=${active} FROM public.profiles p JOIN auth.users u ON u.id=p.id JOIN public.user_roles r ON r.user_id=p.id
       WHERE d.id=p.dealer_id AND d.id=${literal(activationFixture.dealerId)}::uuid AND ${fixtureGuard} RETURNING d.id`
    : `UPDATE public.profiles p SET is_active=${active} FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
       WHERE p.id=u.id AND p.dealer_id=${literal(activationFixture.dealerId)}::uuid AND ${fixtureGuard} RETURNING p.id`;
  assert.equal(query(statement, true).length, 1, 'Only the verified controlled dealer fixture may change');
};
const fields = 'id,sku,name,description,unit_price,is_active';
const products = (token, filter = '') => request(`/rest/v1/products?select=${fields}&order=sku.asc${filter}`, token);
let before;
try {
  const projects = cli(['projects', 'list', '--output-format', 'json']).projects.filter(p => p.id === project);
  assert.equal(projects.length, 1); assert.equal(projects[0].name, 'PrepaidDealerPortal');
  assert.equal(projects[0].status, 'ACTIVE_HEALTHY');
  before = snapshot();
  assert.equal(before.auth.length, 4); assert.equal(before.products.length, 12);
  assert.equal(before.roles.filter(r => r.role === 'admin').length, 1);
  assert.equal(before.roles.find(r => r.user_id === admin.id)?.role, 'admin');
  for (const dealer of dealers) {
    assert.equal(before.roles.find(r => r.user_id === dealer.id)?.role, 'dealer');
    assert.equal(before.auth.find(u => u.id === dealer.id)?.email, dealer.email);
    const profile = before.profiles.find(p => p.id === dealer.id);
    assert.equal(profile?.is_active, true); assert.equal(profile.dealer_id, dealer.dealerId);
    assert.equal(before.dealers.find(d => d.id === dealer.dealerId)?.is_active, true);
  }
  const marker = query(`SELECT 1 AS present FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id WHERE ${fixtureGuard}`);
  assert.equal(marker.length, 1);
  assert.deepEqual(before.history.map(m => m.version), ['20261120000100', '20261120000200', '20261120000300']);
  const permissions = query(`SELECT r,has_table_privilege(r,'public.products','INSERT') AS i,
    has_table_privilege(r,'public.products','UPDATE') AS u,has_table_privilege(r,'public.products','DELETE') AS d
    FROM unnest(ARRAY['anon','authenticated']) r ORDER BY r`);
  assert.ok(permissions.every(p => !p.i && !p.u && !p.d));
  assert.equal(ok(await request('/auth/v1/settings')).mailer_autoconfirm, true);
  passed('Healthy pinned project, three active dealer fixtures/one admin, three migrations, public configuration and unchanged demo Auth setting');

  const suite = readFileSync('supabase/verification/test_catalog_access.sql', 'utf8').replace('BEGIN;',
    `BEGIN;\nSELECT set_config('pdp.catalog_dealer_id',${literal(activationFixture.id)},true),set_config('pdp.catalog_admin_id',${literal(admin.id)},true);`);
  const suitePath = '.verification/catalog-live-rollback.sql';
  writeFileSync(suitePath, suite, { mode: 0o600 });
  const sqlResult = cli(['db', 'query', `--remote=${project}`, '--file', suitePath, '--yes']);
  assert.equal(sqlResult.rows[0].result, 'passed; catalog/status fixtures and JWT settings rolled back');
  assert.deepEqual(snapshot(), before);
  passed('Hosted PostgreSQL rollback suite: allowed/denied reads, inactive status, 22 forbidden statements, unchanged final snapshot');

  const active = before.products.filter(p => p.is_active);
  const inactive = before.products.filter(p => !p.is_active);
  assert.equal(active.length, 10); assert.equal(inactive.length, 2);
  const normalize = rows => rows.map(p => ({ id: p.id, sku: p.sku, name: p.name, description: p.description,
    unit_price: Number(p.unit_price), is_active: p.is_active }));
  const sessions = [];
  for (const [index, account] of [...dealers, admin].entries()) {
    const session = ok(await request('/auth/v1/token?grant_type=password', null, 'POST', { email: account.email, password: account.password }));
    assert.equal(session.user.id, account.id); assert.ok(session.access_token && session.refresh_token);
    const token = session.access_token;
    assert.equal(ok(await request('/auth/v1/user', token)).id, account.id);
    sessions.push(token);
    if (index === dealers.length) {
      assert.deepEqual(ok(await products(token)), []);
      assert.deepEqual(ok(await products(token, `&id=eq.${active[0].id}`)), []);
      passed('Real admin session sees no dealer-only catalog rows, including direct product lookup');
      continue;
    }
    assert.deepEqual(normalize(ok(await products(token))), normalize(active));
    assert.deepEqual(ok(await products(token, '&is_active=eq.false')), []);
    for (const product of inactive) assert.deepEqual(ok(await products(token, `&id=eq.${product.id}`)), []);
    assert.equal(ok(await products(token, `&id=eq.${active[0].id}`)).length, 1);
    denied(await request('/rest/v1/products', token, 'POST', { sku: 'PDP-TEST-5A-API-DENIED', name: 'Forbidden synthetic insert', unit_price: 1 }));
    denied(await request(`/rest/v1/products?id=eq.${active[0].id}`, token, 'PATCH', { unit_price: 0 }));
    denied(await request(`/rest/v1/products?id=eq.${inactive[0].id}`, token, 'PATCH', { is_active: true }));
    denied(await request(`/rest/v1/products?id=eq.${active[0].id}`, token, 'DELETE'));
    passed(`Real dealer ${index + 1}: ten exact active products; inactive lookups hidden; insert/update/reactivation/delete denied`);
  }
  denied(await products());
  passed('Anonymous public Data API catalog read denied with 42501');

  const reusedToken = sessions[0];
  try {
    restoreProfile = true; activation(false, false);
    assert.deepEqual(ok(await products(reusedToken)), []);
    assert.deepEqual(ok(await products(reusedToken, `&id=eq.${active[0].id}`)), []);
    activation(false, true); restoreProfile = false;
    assert.equal(ok(await products(reusedToken)).length, 10);
    restoreOrganization = true; activation(true, false);
    assert.deepEqual(ok(await products(reusedToken)), []);
    activation(true, true); restoreOrganization = false;
    assert.equal(ok(await products(reusedToken)).length, 10);
    passed('Same real dealer JWT loses access for inactive profile and organization separately; restoration recovers ten products');
  } finally {
    if (restoreProfile) { activation(false, true); restoreProfile = false; }
    if (restoreOrganization) { activation(true, true); restoreOrganization = false; }
  }
  assert.deepEqual(snapshot(), before);
  passed('Final Auth identity/profile/organization/role/product/migration snapshots unchanged; no orders/items introduced');
  report.completed = true; save();
} catch (error) {
  report.failure = error.message; save();
  console.error(`Catalog verification stopped: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (restoreProfile) activation(false, true);
  if (restoreOrganization) activation(true, true);
}
