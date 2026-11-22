import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDownloader } from '../supabase/functions/download-order-document/handler.js';
const userId = '00000000-0000-4000-8000-000000000001', orderId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003', organizationId = '00000000-0000-4000-8000-000000000004';
const otherOrganization = '00000000-0000-4000-8000-000000000005', bearer = 'Bearer test.user.signature';
const pdf = new TextEncoder().encode('%PDF-1.7\nSynthetic already-published test bytes\n%%EOF');
function fixture(options = {}) {
  const state = { role: 'dealer', active: true, organizationActive: true, published: true, ...options }, calls = [];
  const make = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, init });
    if (path === '/auth/v1/user') return make({ id: userId, user_metadata: { role: 'admin', is_active: true } }, state.invalidJwt ? 401 : 200);
    if (path.startsWith('/rest/v1/profiles')) return make(state.missingProfile ? [] : [{ id: userId, dealer_id: state.noOrganization ? null : organizationId, is_active: state.active }]);
    if (path.startsWith('/rest/v1/user_roles')) return make([{ role: state.role }]);
    if (path.startsWith('/rest/v1/dealers')) return make([{ id: organizationId, is_active: state.organizationActive }]);
    if (path.startsWith('/rest/v1/orders')) return make(state.orderDenied ? [] : [{ id: orderId, dealer_id: state.crossOrganization ? otherOrganization : organizationId }]);
    if (path.startsWith('/rest/v1/order_documents')) return make(!state.published || state.metadataDenied ? [] : [{ id: documentId, order_id: orderId,
      object_path: state.badPath ?? `${orderId}/${documentId}.pdf`, file_name: state.badName ?? 'Synthetic invoice.pdf', byte_size: pdf.length }]);
    if (path.startsWith('/storage/v1/object/authenticated/')) {
      if (state.storageError) throw new Error('Do not leak server-only-test-key or internal Storage URL');
      if (state.revokeDuringFetch) state.active = false;
      if (state.disableOrganizationDuringFetch) state.organizationActive = false;
      return new Response(state.truncated ? pdf.subarray(0, 10) : pdf, { headers: { 'Content-Type': state.badType ? 'text/plain' : 'application/pdf', 'CF-Cache-Status': 'HIT' } });
    }
    throw new Error('Unexpected backend request');
  };
  const handler = createDownloader({ url: 'https://project.example', publicKey: 'test-public-key', secretKey: 'server-only-test-key', fetcher });
  const request = (body = { documentId }, headers = {}, method = 'POST') => handler(new Request('https://edge.example/download-order-document', {
    method, headers: { Authorization: bearer, 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }));
  return { state, calls, request };
}
function noStore(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store'); assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.match(response.headers.get('vary'), /Authorization/); assert.equal(response.headers.get('etag'), null); assert.equal(response.headers.get('location'), null);
}
test('admin and owning active dealer get only published bytes with safe attachment and no cache validators or URLs', async () => {
  for (const options of [{}, { role: 'admin', noOrganization: true }]) {
    const f = fixture(options), response = await f.request(); assert.equal(response.status, 200); noStore(response);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf); assert.equal(response.headers.get('content-disposition'), 'attachment; filename="Synthetic invoice.pdf"');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cf-cache-status'), null);
    const storage = f.calls.find(c => c.path.startsWith('/storage'));
    assert.equal(storage.init.headers.apikey, 'server-only-test-key'); assert.equal(storage.init.headers.Authorization, undefined); assert.equal(storage.init.redirect, 'error');
    for (const c of f.calls.filter(c => !c.path.startsWith('/storage'))) { assert.equal(c.init.headers.Authorization, bearer); assert.equal(c.init.headers.apikey, 'test-public-key'); assert.equal(c.init.cache, 'no-store'); }
    assert.equal(f.calls.filter(c => c.path === '/auth/v1/user').length, 2);
    assert.equal(f.calls.filter(c => c.path.startsWith('/rest/v1/orders')).length, 2);
  }
});
test('same warmed JWT is reauthorized on every POST after profile or organization deactivation, despite a cached Storage response', async () => {
  for (const field of ['active', 'organizationActive']) {
    const f = fixture(); assert.equal((await f.request()).status, 200); f.state[field] = false;
    const reads = f.calls.filter(c => c.path.startsWith('/storage')).length, denied = await f.request();
    assert.equal(denied.status, 403); noStore(denied); assert.equal(f.calls.filter(c => c.path.startsWith('/storage')).length, reads);
  }
});
test('revocation committed during privileged byte fetch discards the buffer before sending any PDF', async () => {
  for (const options of [{ revokeDuringFetch: true }, { disableOrganizationDuringFetch: true }]) {
    const f = fixture(options), response = await f.request(); assert.equal(response.status, 403); noStore(response);
    assert.equal(response.headers.get('content-type'), 'application/json'); assert.ok(!(await response.text()).includes('%PDF'));
  }
});
test('missing/forged JWT, inactive or missing profile, unknown role and inactive/missing organization fail before privileged fetch', async () => {
  const absent = fixture(); assert.equal((await absent.request({ documentId }, { Authorization: '' })).status, 401); assert.equal(absent.calls.length, 0);
  for (const options of [{ invalidJwt: true }, { active: false }, { missingProfile: true }, { role: 'owner' }, { organizationActive: false }, { noOrganization: true }]) {
    const f = fixture(options), response = await f.request(); assert.ok([401, 403].includes(response.status)); noStore(response); assert.ok(!f.calls.some(c => c.path.startsWith('/storage')));
  }
});
test('cross-organization, hidden order, unpublished/missing document and unsafe stored paths/names cannot trigger a secret-key read', async () => {
  for (const options of [{ crossOrganization: true }, { orderDenied: true }, { published: false }, { metadataDenied: true },
    { badPath: `${otherOrganization}/${documentId}.pdf` }, { badName: 'header\r\ninjection.pdf' }]) {
    const f = fixture(options), response = await f.request(); assert.ok([404, 502].includes(response.status)); noStore(response); assert.ok(!f.calls.some(c => c.path.startsWith('/storage')));
  }
});
test('strict UUID-only request rejects paths, actor/ownership overrides and unknown fields; bad method and CORS fail closed', async () => {
  for (const body of [{ documentId: '../file' }, { documentId, path: '/secret' }, { documentId, actorId: userId }, {}, null]) {
    const f = fixture(), response = await f.request(body); assert.equal(response.status, 400); noStore(response); assert.ok(!f.calls.some(c => c.path.startsWith('/storage')));
  }
  const f = fixture(); assert.equal((await f.request({ documentId }, {}, 'GET')).status, 405);
  assert.equal((await f.request({ documentId }, { Origin: 'https://attacker.example' })).status, 403);
  const preflight = await f.request(undefined, { Origin: 'https://prepaiddealersportal.netlify.app' }, 'OPTIONS'); assert.equal(preflight.status, 204); noStore(preflight);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://prepaiddealersportal.netlify.app');
});
test('corrupt/mismatched stored bytes and network errors reveal neither PDF nor secret/internal URL', async () => {
  for (const options of [{ truncated: true }, { badType: true }, { storageError: true }]) {
    const response = await fixture(options).request(); assert.equal(response.status, 502); noStore(response);
    const body = await response.text(); assert.ok(!body.includes('%PDF') && !body.includes('server-only-test-key') && !body.includes('/storage/'));
  }
});
test('conditional/range headers never bypass authorization or produce cached 304 responses', async () => {
  const f = fixture(), response = await f.request({ documentId }, { 'If-None-Match': 'old-etag', Range: 'bytes=0-2' });
  assert.equal(response.status, 200); noStore(response); assert.equal((await response.arrayBuffer()).byteLength, pdf.length);
  f.state.active = false; assert.equal((await f.request({ documentId }, { 'If-None-Match': 'old-etag' })).status, 403);
});
