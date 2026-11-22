// Explicit opt-in. Existing synthetic accounts/orders only; no order or Auth changes.
// Retains invalid pending PDF fixtures. Bounded activation tests always restore flags.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { state, save, capture, login, request, ok, query, literal, project } from './order_live_support.mjs';
import { upload, directDownload, list, publish, metadata, unavailable, readable, blocked, immutable, endpointAuth, storageRequest, digest } from './document_live_checks.mjs';
import { validatePdf, MAX_PDF_BYTES } from '../functions/publish-order-document/pdf.js';
assert.equal(process.env.PDP_DOCUMENTS_LIVE, '1', 'Explicit opt-in required for hosted synthetic PDF/activation checks');
const ledgerPath = '.verification/document-storage-live-state.json', ledger = state(ledgerPath), original = ledger.documents[0];
const baseline = state('.verification/11a-011-before.json').business, admin = state('.verification/demo-admin-candidate.json');
assert.equal(query("SELECT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261122001200') AS ready")[0].ready, true,
  'Do not run proxy acceptance before separately approved 012 and Edge deployment');
const accounts = state('.verification/identity-live-state.json'), inactive = state('.verification/session-register-preview.json');
assert.equal(original.id, '9b07ab14-98c2-4290-8372-d339a8f1bb40'); assert.equal(original.published, true);
const document = { ...original, actor: admin.id }, bytes = new Uint8Array(readFileSync('.verification/11a-valid.pdf'));
assert.equal(digest(bytes), original.sha256); assert.equal(baseline.profiles.find(p => p.id === inactive.id).is_active, false);
assert.equal(baseline.orders.find(o => o.id === ledger.orderId).dealer_id, accounts.a.dealerId);
const reportPath = '.verification/document-storage-live-report.json', report = { project, passed: [], completed: false, invalidPublicationStatuses: {} };
const pass = message => { report.passed.push(message); save(reportPath, report); console.log('PASS ' + message); };
const [adminToken, aToken, bToken, inactiveToken] = await Promise.all([login(admin), login(accounts.a), login(accounts.b), login(inactive)]);
const originalAdmin = baseline.profiles.find(p => p.id === admin.id); assert.equal(originalAdmin.is_active, true);
let restoreProfile = false, restoreOrganization = false, restoreAdmin = false, failure;
const activateProfile = active => request('/rest/v1/rpc/set_dealer_profile_active', adminToken, 'POST', { p_profile_id: accounts.a.id, p_is_active: active });
const activateOrganization = active => request('/rest/v1/dealers?id=eq.' + accounts.a.dealerId, adminToken, 'PATCH', { is_active: active }, { Prefer: 'return=representation' });
function adminActive(active) {
  const rows = query(`UPDATE public.profiles p SET is_active=${active} FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
    WHERE p.id=u.id AND u.id=${literal(admin.id)}::uuid AND u.email=${literal(admin.email)} AND r.role='admin'
    AND p.display_name=${literal(originalAdmin.display_name)} AND p.is_active=${!active} RETURNING p.id`, true);
  assert.equal(rows.length, 1, 'Only the verified synthetic admin activation flag may change');
}
function fixture(kind, data) {
  let record = ledger.documents.find(d => d.kind === kind);
  if (!record) { const id = randomUUID(); record = { id, path: `${ledger.orderId}/${id}.pdf`, fileName: `Synthetic 11A ${kind}.pdf`, kind,
    sha256: digest(data), byteSize: data.length }; ledger.documents.push(record); save(ledgerPath, ledger); }
  assert.equal(record.sha256, digest(data)); return record;
}
try {
  await readable(adminToken, document); await readable(aToken, document);
  for (const token of [adminToken, aToken, bToken, null]) unavailable(await directDownload(token, document.path));
  for (const token of [null, bToken, inactiveToken]) await blocked(token, document);
  pass('admin and owning dealer download/list/metadata; anonymous, cross-organization and existing inactive-account denial');
  for (const token of [adminToken, aToken, bToken, null]) await immutable(token, document, bytes);
  await readable(adminToken, document);
  for (const token of [null, adminToken, aToken]) unavailable(await storageRequest('/storage/v1/object/public/order-documents/' + original.path, token));
  pass('overwrite, delete, signed download/upload URLs, public URLs, client metadata writes and registration RPC denied; original bytes unchanged');

  await endpointAuth(adminToken, aToken, inactiveToken, document);
  const conflicting = await publish(adminToken, document, { fileName: 'Different safe name.pdf' }); assert.equal(conflicting.status, 409);
  const crossOrder = baseline.orders.find(o => o.dealer_id === accounts.b.dealerId).id;
  assert.equal((await publish(adminToken, document, { orderId: crossOrder })).status, 404);
  unavailable(await directDownload(aToken, `${crossOrder}/${original.id}.pdf`));
  const deniedPath = `${ledger.orderId}/${randomUUID()}.pdf`;
  for (const token of [null, aToken, bToken, inactiveToken]) unavailable(await upload(token, deniedPath, bytes));
  for (const path of [`${randomUUID()}/${randomUUID()}.pdf`, `${ledger.orderId}/${randomUUID()}.txt`, `${ledger.orderId}/${randomUUID()}.pdf/extra`])
    unavailable(await upload(adminToken, path, bytes));
  unavailable(await upload(adminToken, `${ledger.orderId}/${randomUUID()}.pdf`, bytes, 'text/plain'));
  pass('ES256 JWT authorization, CORS allow/deny/preflight, strict input/methods, PT409 metadata conflict, dealer upload and order/path/MIME tampering denial');

  const invalid = [ ['spoofed', new TextEncoder().encode('<html>This synthetic file is not a PDF</html>')],
    ['malformed', new TextEncoder().encode('%PDF-1.7\ninvalid synthetic structure\n%%EOF')],
    ['encrypted', new Uint8Array(readFileSync('.verification/11a-encrypted.pdf'))] ];
  for (const [kind, data] of invalid) {
    await assert.rejects(validatePdf(data, 'application/pdf'), { status: 415 });
    const record = fixture(kind, data);
    if (!record.uploaded) { const result = await upload(adminToken, record.path, data); assert.equal(result.status, 200); record.uploaded = true; save(ledgerPath, ledger); }
    const result = await publish(adminToken, record); assert.equal(result.status, 415, kind + ' PDF must not be published');
    report.invalidPublicationStatuses[kind] = result.status; await blocked(aToken, record);
    assert.deepEqual(ok(await metadata(adminToken, record.id)), []);
  }
  const large = await upload(adminToken, `${ledger.orderId}/${randomUUID()}.pdf`, new Uint8Array(MAX_PDF_BYTES + 1));
  assert.ok([400, 413].includes(large.status)); assert.ok(large.body.statusCode === '413' || large.status === 413);
  report.oversizeStatus = { http: large.status, code: large.body.statusCode ?? large.body.code };
  pass('spoofed, malformed and genuinely encrypted PDFs rejected HTTP 415 before publication; 10 MiB+1 upload rejected; invalid pending files hidden from dealer');

  restoreProfile = true; assert.equal(ok(await activateProfile(false)), accounts.a.id);
  await blocked(aToken, document); assert.equal((await publish(aToken, document)).status, 403);
  unavailable(await upload(aToken, deniedPath, bytes)); assert.equal(ok(await activateProfile(true)), accounts.a.id); restoreProfile = false;
  await readable(aToken, document);
  restoreOrganization = true; assert.equal(ok(await activateOrganization(false))[0].is_active, false);
  await blocked(aToken, document); await readable(adminToken, document);
  assert.equal(ok(await activateOrganization(true))[0].is_active, true); restoreOrganization = false; await readable(aToken, document);
  restoreAdmin = true; adminActive(false);
  await blocked(adminToken, document); assert.equal((await publish(adminToken, document)).status, 403); unavailable(await upload(adminToken, deniedPath, bytes));
  adminActive(true); restoreAdmin = false; await readable(adminToken, document);
  pass('existing JWT loses access after profile/organization deactivation; inactive admin cannot read/upload/publish; all synthetic activation flags restored');

  for (let i = 0; i < 2; i++) assert.equal(ok(await publish(adminToken, document)).id, original.id);
  const rows = ok(await request('/rest/v1/order_documents?select=*', adminToken)); assert.equal(rows.length, 1); assert.equal(rows[0].id, original.id);
  await readable(adminToken, document); await readable(aToken, document); assert.equal(ledger.uncertainResponseRetryPassed, true);
  const visible = await list(aToken, ledger.orderId); assert.equal(visible.body.filter(row => row.id).length, 1);
  pass('discarded-response recovery and repeated exact publication preserve original UUID/path/hash; one metadata row; dealer sees only published PDF');
} catch (error) { failure = error; report.failure = { name: error.name, message: error.message }; }
finally {
  if (restoreAdmin) adminActive(true);
  if (restoreOrganization) assert.equal(ok(await activateOrganization(true))[0].is_active, true);
  if (restoreProfile) assert.equal(ok(await activateProfile(true)), accounts.a.id);
  const after = capture(); for (const key of ['auth', 'profiles', 'dealers', 'roles', 'products', 'orders', 'items']) assert.deepEqual(after[key], baseline[key], 'Preserve original ' + key);
  report.originalDataPreserved = true; report.completed = !failure; report.retainedDocuments = ledger.documents.map(d => ({ id: d.id, kind: d.kind, published: Boolean(d.published) })); save(reportPath, report);
}
if (failure) throw failure;
pass('all original account identities, profiles, roles, organizations, products, orders and historical snapshots preserved');
