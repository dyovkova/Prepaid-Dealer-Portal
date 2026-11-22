// Hosted checks use public API configuration and real user JWTs. Never log tokens.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadEnv } from 'vite';
import { request, ok, denied } from './order_live_support.mjs';
const env = loadEnv('production', process.cwd(), 'VITE_');
assert.equal(env.VITE_SUPABASE_URL, 'https://niabpabsvdgxackjjcsb.supabase.co');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function storageRequest(path, token, method = 'GET', body, headers = {}) {
  const json = body !== undefined && !(body instanceof Uint8Array);
  const response = await fetch(env.VITE_SUPABASE_URL + path, { method, signal: AbortSignal.timeout(30000),
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: json ? JSON.stringify(body) : body } : {}) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, headers: response.headers,
    body: response.headers.get('content-type')?.includes('application/json') && bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : bytes };
}
export const upload = (token, path, bytes, type = 'application/pdf', method = 'POST', upsert = false) =>
  storageRequest('/storage/v1/object/order-documents/' + path, token, method, bytes, { 'Content-Type': type, 'x-upsert': String(upsert) });
export const directDownload = (token, path) => storageRequest('/storage/v1/object/authenticated/order-documents/' + path, token);
export const download = (token, path) => storageRequest('/functions/v1/download-order-document', token, 'POST', { documentId: path.split('/').at(-1).replace(/\.pdf$/, '') });
export const list = (token, order) => storageRequest('/storage/v1/object/list/order-documents', token, 'POST', { prefix: order + '/', limit: 100, offset: 0 });
export const publish = (token, document, extra = {}, headers = {}) => request('/functions/v1/publish-order-document', token, 'POST',
  { orderId: document.path.split('/')[0], documentId: document.id, fileName: document.fileName, ...extra }, headers);
export const metadata = (token, id) => request('/rest/v1/order_documents?select=*&id=eq.' + id, token);
export const unavailable = result => assert.ok([400, 401, 403, 404].includes(result.status), `Expected denied read/write, received HTTP ${result.status}`);
export async function readable(token, document) {
  const file = await download(token, document.path); assert.equal(file.status, 200); assert.equal(digest(file.body), document.sha256);
  assert.match(file.headers.get('content-type'), /^application\/pdf/);
  assert.match(file.headers.get('cache-control'), /no-store/); assert.equal(file.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(file.headers.get('content-disposition'), `attachment; filename="${document.fileName}"`);
  const rows = ok(await metadata(token, document.id)); assert.equal(rows.length, 1); assert.equal(rows[0].object_path, document.path);
  assert.equal(rows[0].file_name, document.fileName); assert.equal(rows[0].byte_size, document.byteSize);
  assert.ok((await list(token, document.path.split('/')[0])).body.some(row => row.name === document.id + '.pdf'));
}
export async function blocked(token, document) {
  unavailable(await download(token, document.path));
  if (token) assert.deepEqual(ok(await metadata(token, document.id)), []); else denied(await metadata(null, document.id));
  const files = await list(token, document.path.split('/')[0]);
  // Other published files in this same authorized order may still be listed.
  if (files.status === 200) assert.ok(!files.body.some(row => row.name === document.id + '.pdf')); else unavailable(files);
}
export async function immutable(token, document, bytes) {
  unavailable(await upload(token, document.path, bytes, 'application/pdf', 'POST', true));
  unavailable(await upload(token, document.path, bytes, 'application/pdf', 'PUT'));
  const deletion = await storageRequest('/storage/v1/object/order-documents', token, 'DELETE', { prefixes: [document.path] });
  if (deletion.status === 200) assert.deepEqual(deletion.body, []); else unavailable(deletion);
  unavailable(await storageRequest('/storage/v1/object/sign/order-documents/' + document.path, token, 'POST', { expiresIn: 60 }));
  unavailable(await storageRequest('/storage/v1/object/upload/sign/order-documents/' + document.path, token, 'POST', {}));
  for (const [method, body] of [['POST', { id: document.id, order_id: document.path.split('/')[0], uploaded_by: document.actor, file_name: 'Forged.pdf', byte_size: 1 }],
    ['PATCH', { file_name: 'Forged.pdf' }], ['DELETE', undefined]]) {
    denied(await request('/rest/v1/order_documents' + (method === 'POST' ? '' : '?id=eq.' + document.id), token, method, body));
  }
  denied(await request('/rest/v1/rpc/register_order_document', token, 'POST', { p_actor_id: document.actor,
    p_order_id: document.path.split('/')[0], p_document_id: document.id, p_file_name: document.fileName, p_byte_size: document.byteSize }));
}
export async function endpointAuth(adminToken, dealerToken, inactiveToken, document) {
  assert.equal((await publish(null, document)).status, 401);
  assert.equal((await publish(dealerToken, document)).status, 403); assert.equal((await publish(inactiveToken, document)).status, 403);
  assert.equal((await publish('invalid.user.signature', document)).status, 401);
  assert.equal((await publish(adminToken, document, { actorId: document.actor })).status, 400);
  assert.equal((await publish(adminToken, document, { fileName: '../unsafe.pdf' })).status, 400);
  const preflight = await storageRequest('/functions/v1/publish-order-document', null, 'OPTIONS', undefined,
    { Origin: 'https://prepaiddealersportal.netlify.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type' });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://prepaiddealersportal.netlify.app');
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
  const forbidden = await publish(adminToken, document, {}, { Origin: 'https://unauthorized.example' });
  assert.equal(forbidden.status, 403);
  const allowed = await storageRequest('/functions/v1/publish-order-document', adminToken, 'GET', undefined, { Origin: 'https://prepaiddealersportal.netlify.app' });
  assert.equal(allowed.status, 405); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://prepaiddealersportal.netlify.app');
}
