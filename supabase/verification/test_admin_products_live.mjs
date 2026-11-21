// Opt-in 8A verification only: existing public Auth accounts, bounded product
// CRUD, temporary activation changes restored in finally. Never deploys SQL,
// creates users/orders, promotes roles, hard-deletes data or changes Auth config.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { project,state,save,exists,query,literal,capture,login,request,ok,setFixtureActive } from './order_live_support.mjs';
import { products,patch,insert,writesDenied,deleteDenied,constraints,history } from './admin_product_live_checks.mjs';

assert.equal(process.env.PDP_ADMIN_PRODUCTS_LIVE, '1', 'Explicit opt-in required: controlled product/status tests');
const report = { project, passed: [], completed: false };
const reportPath = '.verification/admin-products-live-report.json';
const manifestPath = '.verification/admin-products-live-state.json';
const baselinePath = '.verification/admin-products-live-before.json';
const passed = message => { report.passed.push(message); save(reportPath, report); console.log(`PASS ${message}`); };
const manifest = exists(manifestPath) ? state(manifestPath) : { sku: 'PDP-TEST-8A-ADMIN', startedAt: new Date().toISOString() };
const accounts = state('.verification/identity-live-state.json');
const dealers = [accounts.a, accounts.b, state('.verification/auth-ui-fixture.json')];
const admin = state('.verification/demo-admin-candidate.json');
assert.equal(admin.id, '6c99cda5-d354-496b-ba85-0218fd9ee1af');
let before, adminToken, reference, restoreReference = false, inactiveAdmin = false, inactiveDealer = false, inactiveOrganization = false;
const editable = row => Object.fromEntries(['sku','name','description','unit_price','is_active'].map(key => [key,row[key]]));
function adminActive(active) {
  const rows = query(`UPDATE public.profiles p SET is_active=${active}
    FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
    WHERE p.id=u.id AND u.id=${literal(admin.id)}::uuid AND u.email=${literal(admin.email)}
      AND p.display_name=${literal(before.profiles.find(p=>p.id===admin.id).display_name)} AND r.role='admin'
    RETURNING p.id`, true);
  assert.equal(rows.length, 1, 'Only the verified existing demo admin profile may change');
}
try {
  const current = capture();
  if (!exists(baselinePath)) save(baselinePath, current);
  before = state(baselinePath);
  assert.equal(before.history.length, 6); assert.equal(before.history.at(-1).version, '20261121000600');
  assert.equal(before.roles.filter(r=>r.role==='admin').length, 1);
  for (const account of [admin, ...dealers]) {
    assert.equal(current.auth.find(u=>u.id===account.id)?.email, account.email);
    assert.equal(current.profiles.find(p=>p.id===account.id)?.is_active, true);
    assert.equal(current.roles.find(r=>r.user_id===account.id)?.role, account===admin?'admin':'dealer');
  }
  adminToken = await login(admin);
  const tokens = [];
  for (const dealer of dealers) tokens.push(await login(dealer));
  const all = ok(await products(adminToken));
  assert.ok(before.products.every(p=>all.some(row=>isDeepStrictEqual(row,p))), 'Admin reads every original active/archived product');
  save(manifestPath, manifest);
  let fixture = all.find(p=>p.sku===manifest.sku);
  if (fixture) {
    assert.ok(!before.products.some(p=>p.sku===manifest.sku), 'Stop on pre-existing SKU collision');
    assert.equal(fixture.id, manifest.id, 'Only resume the recorded synthetic fixture');
  } else {
    fixture = ok(await insert(adminToken, { sku: manifest.sku, name: 'Synthetic 8A admin product', description: 'Controlled backend verification', unit_price: 1.25 }))[0];
    manifest.id = fixture.id; save(manifestPath, manifest);
  }
  assert.ok(fixture.id && fixture.created_at);
  await constraints(adminToken, fixture, before.products[0].sku);
  const edited = { name: 'Synthetic 8A edited product', description: 'Synthetic archive fixture; no real company data', unit_price: 4.75, is_active: true };
  assert.equal(ok(await patch(adminToken, fixture.id, edited)).length, 1);
  await deleteDenied(adminToken, fixture.id);
  passed('Existing demo admin: full SELECT, INSERT, UPDATE, constraints/defaults/uniqueness, protected columns and DELETE denial');

  for (let index=0; index<dealers.length; index++) {
    const rows = ok(await products(tokens[index]));
    assert.equal(rows.length, before.products.filter(p=>p.is_active).length+1); assert.ok(rows.every(p=>p.is_active));
    await writesDenied(tokens[index], fixture.id);
  }
  await writesDenied(null, fixture.id);
  assert.ok([401,403].includes((await products(null)).status));
  passed('Three real dealers and anonymous caller cannot insert/update/archive/reactivate/delete products');

  assert.equal(ok(await patch(adminToken, fixture.id, { is_active: false })).length, 1);
  for (const token of tokens) {
    assert.equal(ok(await products(token)).length, before.products.filter(p=>p.is_active).length);
    assert.deepEqual(ok(await products(token, `&id=eq.${fixture.id}`)), []);
    assert.deepEqual(ok(await products(token, '&is_active=eq.false')), []);
  }
  await deleteDenied(adminToken, fixture.id);
  assert.equal(ok(await products(adminToken, `&id=eq.${fixture.id}`))[0].is_active, false);
  passed('Soft archive retains the admin-visible row, hides archived UUIDs from dealer catalogs and still forbids DELETE');

  const own = before.orders.filter(o=>o.dealer_id===accounts.a.dealerId);
  reference = before.products.find(p=>p.is_active && p.sku.startsWith('PDP-DEMO-') && before.items.some(i=>i.product_id===p.id && own.some(o=>o.id===i.order_id)));
  assert.ok(reference, 'Require an existing synthetic referenced product; do not create an order');
  try {
    restoreReference = true;
    assert.equal(ok(await patch(adminToken, reference.id, { sku: 'PDP-TEST-8A-SNAPSHOT', name: 'Synthetic temporary snapshot test', unit_price: 88.99, is_active: false })).length, 1);
    assert.deepEqual(ok(await products(tokens[0], `&id=eq.${reference.id}`)), []);
    for (let index=0; index<dealers.length; index++) await history(tokens[index], before, dealers[index]);
    assert.deepEqual(ok(await request('/rest/v1/orders?select=*', adminToken)), []);
    assert.deepEqual(ok(await request('/rest/v1/order_items?select=*', adminToken)), []);
  } finally {
    ok(await patch(adminToken, reference.id, editable(reference))); restoreReference = false;
  }
  passed('Actual archive/rename/reprice of a referenced demo SKU leaves real dealer history/saved snapshots intact; original product restored; admin-wide order access remains denied');

  try {
    inactiveDealer = true; setFixtureActive(accounts.a, false, false);
    assert.deepEqual(ok(await products(tokens[0])), []); await writesDenied(tokens[0], fixture.id);
  } finally { setFixtureActive(accounts.a, false, true); inactiveDealer = false; }
  try {
    inactiveOrganization = true; setFixtureActive(accounts.a, true, false);
    assert.deepEqual(ok(await products(tokens[0])), []); await writesDenied(tokens[0], fixture.id);
  } finally { setFixtureActive(accounts.a, true, true); inactiveOrganization = false; }
  try {
    inactiveAdmin = true; adminActive(false);
    assert.deepEqual(ok(await products(adminToken)), []); await writesDenied(adminToken, fixture.id);
  } finally { adminActive(true); inactiveAdmin = false; }
  assert.equal(ok(await products(adminToken)).length, before.products.length+1);
  assert.equal(ok(await products(tokens[0])).length, before.products.filter(p=>p.is_active).length);
  passed('Unchanged real JWTs enforce inactive dealer profile, dealer organization and admin profile immediately; all activation restored');

  const after = capture();
  for (const key of ['auth','profiles','dealers','roles','history','policies','orders','items']) assert.ok(isDeepStrictEqual(after[key],before[key]), `Preserve ${key}`);
  assert.ok(isDeepStrictEqual(after.products.filter(p=>p.id!==fixture.id), before.products), 'Preserve all original product values');
  assert.equal(after.products.length, before.products.length+1);
  const retained = after.products.find(p=>p.id===fixture.id); assert.equal(retained.is_active, false);
  manifest.retained = retained; save(manifestPath, manifest);
  passed('All existing accounts, roles, products, orders/items, migration history and policies preserved; exactly one new synthetic archived product retained');
  report.completed = true; save(reportPath, report);
} catch (error) {
  report.failure = error.message; save(reportPath, report); console.error(`8A verification stopped: ${error.message}`); process.exitCode = 1;
} finally {
  if (inactiveAdmin) adminActive(true);
  if (inactiveDealer) setFixtureActive(accounts.a, false, true);
  if (inactiveOrganization) setFixtureActive(accounts.a, true, true);
  if (restoreReference && adminToken) ok(await patch(adminToken, reference.id, editable(reference)));
  if (manifest.id && adminToken) ok(await patch(adminToken, manifest.id, { is_active: false }));
}
