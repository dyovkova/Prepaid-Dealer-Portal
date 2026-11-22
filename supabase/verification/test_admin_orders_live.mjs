// Explicit opt-in. Three retained synthetic orders only; existing order statuses are immutable to this suite.
// Existing demo admin/profile organization activation is bounded and restored in finally; no Auth Admin API/settings/roles.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { state, save, exists, capture, login, request, rpc, ok, denied, query, literal, project } from './order_live_support.mjs';
import { same, orderRow, statusRpc, assertReads, dealerScope, transitionFixture, noStatusAccess, noDirectWrites } from './admin_order_live_checks.mjs';

assert.equal(process.env.PDP_ADMIN_ORDERS_LIVE, '1', 'Opt in to controlled hosted order fixtures');
const skipStale = process.env.PDP_ADMIN_ORDERS_SKIP_STALE === '1'; // Avoid the confirmed deployed PostgREST 14 retry defect.
const admin = state('.verification/demo-admin-candidate.json'), accounts = state('.verification/identity-live-state.json');
const inactive = state('.verification/session-register-preview.json'), before = state('.verification/10a-deployed-state.json').data;
const manifestPath = '.verification/admin-orders-live-state.json', reportPath = '.verification/admin-orders-live-report.json';
assert.ok(exists(manifestPath), 'Reuse the existing synthetic fixture ledger; never create replacement fixtures');
const ledger = state(manifestPath);
assert.equal(ledger.fixtures.length, 3); assert.ok(ledger.fixtures.every(f => f.id && f.payload?.p_request_id));
const report = { project, passed: [], conflictTimingsMs: [], completed: false }, pass = message => { report.passed.push(message); save(reportPath, report); console.log(`PASS ${message}`); };
const recordPair = pair => { ledger.pairs = [...new Set([...ledger.pairs, pair])]; save(manifestPath, ledger); };
let token, restoreAdmin = false, restoreOrganization = false, failure;
const originalAdmin = before.profiles.find(p => p.id === admin.id), originalOrg = before.dealers.find(d => d.id === accounts.a.dealerId);
assert.equal(admin.id, '6c99cda5-d354-496b-ba85-0218fd9ee1af'); assert.equal(originalAdmin.is_active, true); assert.equal(originalOrg.is_active, true);
assert.equal(before.profiles.find(p => p.id === inactive.id)?.is_active, false, 'Use an already inactive controlled fixture');
if (!skipStale) assert.equal(query(`SELECT p.prosrc LIKE '%PT409%' AS corrected FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='transition_order_status'`)[0]?.corrected,
true, 'Do not send stale requests until the separately approved PT409 correction is deployed');
for (const [account, role] of [[admin, 'admin'], [accounts.a, 'dealer'], [accounts.b, 'dealer'], [inactive, 'dealer']]) {
  assert.equal(before.auth.find(u => u.id === account.id)?.email, account.email);
  assert.equal(before.roles.find(r => r.user_id === account.id)?.role, role);
}
function adminActive(active) {
  const rows = query(`UPDATE public.profiles p SET is_active=${active} FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
    WHERE p.id=u.id AND u.id=${literal(admin.id)}::uuid AND u.email=${literal(admin.email)} AND r.role='admin'
    AND p.display_name=${literal(originalAdmin.display_name)} AND p.is_active=${!active} RETURNING p.id`, true);
  assert.equal(rows.length, 1, 'Only the verified demo admin activation flag may change');
}
async function exercise(record, terminal) {
  let current = (await orderRow(token, record.id)).status;
  const attempt = async (from, to, code) => { await transitionFixture(token, record, from, to, before, code); recordPair(`${from}:${to}`); };
  if (current === 'submitted') {
    for (const next of ['submitted', 'completed']) await attempt(current, next, '22023');
    const next = record.label === 'submitted-rejection' ? 'rejected' : 'processing';
    await attempt(current, next); current = next;
  }
  if (current === 'processing') {
    for (const next of ['submitted', 'processing']) await attempt(current, next, '22023');
    if (!skipStale) { const stale = await transitionFixture(token, record, 'submitted', 'rejected', before, 'PT409'); report.conflictTimingsMs.push(stale.elapsedMs); }
    if (record.label === 'processing-rejection' && !skipStale) {
      const body = { p_order_id: record.id, p_expected_status: 'processing', p_new_status: terminal };
      const results = await Promise.all([statusRpc(token, body), statusRpc(token, body)]);
      assert.equal(results.filter(r => r.status >= 200 && r.status < 300 && r.body === record.id).length, 1);
      assert.equal(results.filter(r => r.status === 409 && r.body?.code === 'PT409').length, 1);
      recordPair(`processing:${terminal}`);
    } else await attempt(current, terminal);
    current = terminal;
  }
  assert.equal(current, terminal);
  for (const next of ['submitted', 'processing', 'completed', 'rejected']) await attempt(current, next, '22023');
  if (!skipStale) {
    const stale = await transitionFixture(token, record, 'submitted', 'processing', before, 'PT409'); report.conflictTimingsMs.push(stale.elapsedMs);
  }
  if (!skipStale && record.label === 'processing-rejection') {
    const body = { p_order_id: record.id, p_expected_status: 'processing', p_new_status: 'rejected' };
    const results = await Promise.all([statusRpc(token, body), statusRpc(token, body)]);
    assert.ok(results.every(r => r.status === 409 && r.body?.code === 'PT409' && r.elapsedMs < 5000));
    report.conflictTimingsMs.push(...results.map(r => r.elapsedMs));
    const conflicting = await Promise.all(['completed', 'rejected'].map(next => statusRpc(token, { ...body, p_new_status: next })));
    assert.ok(conflicting.every(r => r.status === 409 && r.body?.code === 'PT409' && r.elapsedMs < 5000));
    report.conflictTimingsMs.push(...conflicting.map(r => r.elapsedMs));
    report.concurrentStaleRequests = 'Both reject on the existing terminal fixture; winning-update races are covered natively.';
  }
}
try {
  const current = capture();
  for (const key of ['auth', 'profiles', 'roles', 'dealers', 'products', 'policies']) same(current[key], before[key], `Preserve ${key} before resuming`);
  same(current.history.filter(m => m.version !== '20261122000900'), before.history, 'Preserve original migration history');
  for (const row of before.orders) same(current.orders.find(o => o.id === row.id), row, 'Preserve every original order/status before resuming');
  for (const row of before.items) same(current.items.find(i => i.order_id === row.order_id && i.product_id === row.product_id), row, 'Preserve every original snapshot before resuming');
  for (const row of current.orders.filter(o => !before.orders.some(b => b.id === o.id))) {
    assert.ok(ledger.fixtures.some(f => f.actor === row.created_by && f.payload.p_request_id === row.request_id && f.payload.p_note === row.note), 'Only the three recorded synthetic orders may be added');
  }
  token = await login(admin); const a = await login(accounts.a), b = await login(accounts.b), inactiveToken = await login(inactive);
  const tokens = new Map([[accounts.a.id, a], [accounts.b.id, b]]);
  await assertReads(token, current.orders, current.items); pass('Real demo admin reads all original and recorded synthetic orders/items and joins');
  assert.equal(ledger.project, project); assert.equal(ledger.fixtures.length, 3);
  for (const record of ledger.fixtures) {
    const id = ok(await rpc(tokens.get(record.actor), record.payload));
    if (record.id) assert.equal(id, record.id); else { assert.ok(!before.orders.some(o => o.id === id)); record.id = id; save(manifestPath, ledger); }
    const saved = await orderRow(token, id); assert.equal(saved.created_by, record.actor);
    assert.equal(saved.dealer_id, before.profiles.find(p => p.id === record.actor).dealer_id);
    const items = ok(await request(`/rest/v1/order_items?order_id=eq.${id}&select=*`, token)); assert.equal(items.length, record.payload.p_items.length);
    for (const line of items) {
      const product = before.products.find(p => p.id === line.product_id);
      assert.equal(line.quantity, record.payload.p_items.find(i => i.product_id === line.product_id).quantity);
      assert.equal(line.sku_snapshot, product.sku); assert.equal(line.name_snapshot, product.name); assert.equal(line.unit_price_snapshot, product.unit_price);
    }
  }
  const initial = capture(); await assertReads(token, initial.orders, initial.items);
  await dealerScope(a, accounts.a, initial); await dealerScope(b, accounts.b, initial);
  for (const table of ['orders', 'order_items']) denied(await request(`/rest/v1/${table}?select=*`, null));
  await assertReads(inactiveToken, [], []);
  for (const caller of [a, b, inactiveToken, null]) await noStatusAccess(caller, ledger.fixtures[0]);
  pass('Three synthetic public-RPC submissions have authoritative snapshots; dealer own/cross-UUID reads and anonymous/inactive administration denials pass');
  for (const record of ledger.fixtures) await exercise(record, record.label === 'completion' ? 'completed' : 'rejected');
  assert.equal(ledger.pairs.length, 16); pass(skipStale ? 'All sixteen status pairs and terminal protections pass; stale/concurrent API checks explicitly skipped due to confirmed deployed 40001 retry defect'
    : 'Original sixteen-pair evidence retained; terminal RPCs and prompt HTTP 409/PT409 for stale, duplicate and conflicting requests pass using the same fixtures');
  for (const body of [{ p_order_id: null, p_expected_status: 'submitted', p_new_status: 'processing' },
    { p_order_id: ledger.fixtures[0].id, p_expected_status: null, p_new_status: 'processing' },
    { p_order_id: ledger.fixtures[0].id, p_expected_status: 'completed', p_new_status: null },
    { p_order_id: ledger.fixtures[0].id, p_expected_status: 'pending', p_new_status: 'approved' },
    { p_order_id: randomUUID(), p_expected_status: 'submitted', p_new_status: 'processing' }]) {
    const response = await statusRpc(token, body); assert.equal(response.body?.code, '22023'); assert.ok(response.status >= 400);
  }
  const hidden = await statusRpc(token, { p_order_id: ledger.fixtures[0].id, p_expected_status: 'completed', p_new_status: 'processing' }, { 'Content-Profile': 'private' });
  assert.equal(hidden.status, 406); assert.equal(hidden.body?.code, 'PGRST106');
  const sample = await orderRow(token, ledger.fixtures[0].id), sampleItem = initial.items.find(i => i.order_id === sample.id);
  for (const caller of [token, a, b, inactiveToken, null]) await noDirectWrites(caller, sample, sampleItem);
  pass('Null/invalid/missing inputs, private Data API exclusion and admin/dealer/inactive/anonymous direct writes/deletes are rejected');
  for (const record of ledger.fixtures) {
    const actor = tokens.get(record.actor); assert.equal(ok(await rpc(actor, record.payload)), record.id);
    const conflict = await rpc(actor, { ...record.payload, p_note: record.payload.p_note + ' conflict' }); assert.equal(conflict.body?.code, '23505');
  }
  const invalid = await rpc(a, { p_request_id: randomUUID(), p_items: [], p_note: 'Synthetic invalid 10A request' }); assert.equal(invalid.body?.code, '22023');
  restoreOrganization = true; ok(await request(`/rest/v1/dealers?id=eq.${originalOrg.id}`, token, 'PATCH', { is_active: false }));
  await assertReads(a, [], []); await noStatusAccess(a, ledger.fixtures[0]);
  denied(await rpc(a, ledger.fixtures[0].payload));
  const history = capture(); await assertReads(token, history.orders, history.items);
  ok(await request(`/rest/v1/dealers?id=eq.${originalOrg.id}`, token, 'PATCH', { is_active: originalOrg.is_active })); restoreOrganization = false;
  restoreAdmin = true; adminActive(false);
  await assertReads(token, [], []); await noStatusAccess(token, ledger.fixtures[0]);
  adminActive(originalAdmin.is_active); restoreAdmin = false;
  pass('Completed/rejected submission retries preserve UUID/status/snapshots; conflicting/invalid requests fail; same-JWT inactive organization/admin restrictions and restoration pass');
  const after = capture();
  for (const key of ['auth', 'profiles', 'roles', 'dealers', 'products', 'policies']) same(after[key], before[key], `Preserve ${key}`);
  same(after.history, current.history, 'No migration changes during hosted tests');
  for (const key of ['orders', 'items']) for (const row of before[key]) same(after[key].find(r => key === 'orders' ? r.id === row.id : r.order_id === row.order_id && r.product_id === row.product_id), row, `Preserve original ${key}`);
  assert.equal(after.orders.length, before.orders.length + 3); assert.equal(after.items.length, before.items.length + 4);
  same(after.items, initial.items, 'All original/new snapshots unchanged during status checks');
  for (const record of ledger.fixtures) { record.retained = after.orders.find(o => o.id === record.id); assert.equal(record.retained.status, record.label === 'completion' ? 'completed' : 'rejected'); }
  ledger.completed = !skipStale; save(manifestPath, ledger);
  pass('All original orders/statuses/snapshots, users, roles, memberships, organization flags, products and security preserved; only three terminal synthetic orders/four items retained');
  report.completed = !skipStale;
  if (skipStale) report.pending = 'Hosted stale/conflicting requests time out under deployed 40001; await approved PT409 correction and rerun using this same ledger.';
} catch (error) { failure = error; report.failure = error.message; }
finally {
  try {
    if (restoreAdmin) adminActive(originalAdmin.is_active);
    if (restoreOrganization) ok(await request(`/rest/v1/dealers?id=eq.${originalOrg.id}`, token, 'PATCH', { is_active: originalOrg.is_active }));
  } catch (error) { failure ??= error; report.restorationFailure = error.message; }
  save(reportPath, report);
}
if (failure) { console.error(`10A hosted verification stopped: ${failure.message}`); process.exitCode = 1; }
else if (skipStale) { console.log(`PENDING ${report.pending}`); process.exitCode = 2; }
