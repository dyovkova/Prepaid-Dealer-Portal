import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createPublisher } from '../supabase/functions/publish-order-document/handler.js';
import { documentInput, readBounded, validatePdf, MAX_PDF_BYTES } from '../supabase/functions/publish-order-document/pdf.js';

const actor = '00000000-0000-4000-8000-000000000001', orderId = '00000000-0000-4000-8000-000000000002', documentId = '00000000-0000-4000-8000-000000000003';
const input = { orderId, documentId, fileName: 'Synthetic order document.pdf' }, bearer = 'Bearer test.user.signature';
const pdf = await PDFDocument.create(); pdf.addPage(); const validPdf = await pdf.save({ useObjectStreams: false });
function fixture(options = {}) {
  const calls = [], make = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname; calls.push({ path, init });
    if (path === '/auth/v1/user') return make({ id: actor, user_metadata: { role: 'admin' } }, options.unauthorized ? 401 : 200);
    if (path.startsWith('/rest/v1/profiles')) return make([{ id: actor, is_active: !options.inactive }]);
    if (path.startsWith('/rest/v1/user_roles')) return make([{ role: options.role ?? 'admin' }]);
    if (path.startsWith('/rest/v1/orders')) return make([{ id: orderId, dealer_id: null }]);
    if (path.startsWith('/storage/v1/object/authenticated/')) {
      if (options.missing) return make({}, 404);
      if (options.revokeDuringFetch) options.inactive = true;
      return new Response(options.bytes ?? validPdf, { headers: { 'Content-Type': options.type ?? 'application/pdf', 'Content-Length': String(options.declaredSize ?? (options.bytes ?? validPdf).length) } });
    }
    if (path === '/rest/v1/rpc/register_order_document') {
      if (options.uncertain) throw new Error('Controlled lost response');
      return options.conflict ? make({ code: 'PT409', detail: 'Do not expose this DB detail' }, 409) : make(documentId);
    }
    throw new Error('Unexpected backend request');
  };
  const handler = createPublisher({ url: 'https://project.example', publicKey: 'test-public-key', secretKey: 'server-only-test-key', fetcher });
  const request = (body = input, headers = {}, method = 'POST') => handler(new Request('https://edge.example/publish-order-document', {
    method, headers: { Authorization: bearer, 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
  return { calls, request };
}
test('safe canonical metadata IDs/names reject paths, header injection and forged attribution', () => {
  assert.equal(documentInput(input).path, `${orderId}/${documentId}.pdf`);
  for (const bad of [{ ...input, fileName: '../x.pdf' }, { ...input, fileName: 'line\r\nx.pdf' }, { ...input, fileName: '<img>.pdf' },
    { ...input, fileName: 'x.exe' }, { ...input, fileName: 'x..pdf' }, { ...input, documentId: '../path' }, { ...input, actorId: actor }, { ...input, fileName: 'x'.repeat(121) + '.pdf' }]) assert.throws(() => documentInput(bad), { status: 400 });
});
test('actual PDF parsing accepts a generated synthetic PDF and rejects malformed/truncated/spoofed PDFs', async () => {
  await validatePdf(validPdf, 'application/pdf');
  for (const [bytes, type] of [[validPdf, 'text/plain'], [new TextEncoder().encode('not a PDF'), 'application/pdf'],
    [validPdf.subarray(0, validPdf.length - 15), 'application/pdf'], [new TextEncoder().encode('%PDF-1.7\ninvalid structure\n%%EOF'), 'application/pdf']]) {
    await assert.rejects(validatePdf(bytes, type), { status: 415 });
  }
});
test('bounded readers reject chunked oversize bodies and zero bytes without trusting Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(6)); c.enqueue(new Uint8Array(6)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBounded(stream, 10), { status: 413 }); assert.equal(cancelled, true);
  await assert.rejects(readBounded(new Blob([]).stream()), { status: 400 });
  await assert.rejects(validatePdf(new Uint8Array(MAX_PDF_BYTES + 1), 'application/pdf'), { status: 413 });
});
test('publish verifies current admin/order before server-only Storage read and registration, without exposing the key', async () => {
  const f = fixture(), result = await f.request(); assert.equal(result.status, 200); assert.deepEqual(await result.json(), { id: documentId, fileName: input.fileName });
  const reads = f.calls.filter(c => !c.path.includes('/rpc/') && !c.path.startsWith('/storage')); assert.equal(reads.length, 8);
  for (const call of reads) { assert.equal(call.init.headers.Authorization, bearer); assert.equal(call.init.headers.apikey, 'test-public-key'); }
  const storage = f.calls.find(c => c.path.startsWith('/storage'));
  assert.equal(storage.init.headers.apikey, 'server-only-test-key'); assert.equal(storage.init.headers.Authorization, undefined);
  assert.ok(f.calls.findIndex(c => c.path.startsWith('/rest/v1/orders')) < f.calls.indexOf(storage));
  const write = f.calls.find(c => c.path.includes('/rpc/')); assert.equal(write.init.headers.apikey, 'server-only-test-key'); assert.equal(write.init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(write.init.body), { p_actor_id: actor, p_order_id: orderId, p_document_id: documentId, p_file_name: input.fileName, p_byte_size: validPdf.length });
  assert.ok(f.calls.every(c => !['DELETE', 'PUT', 'PATCH'].includes(c.init.method)));
});
test('anonymous, invalid Auth, ordinary/forged-metadata dealer and inactive admin cannot reach privileged publication', async () => {
  const absent = fixture(); assert.equal((await absent.request(input, { Authorization: '' })).status, 401); assert.equal(absent.calls.length, 0);
  for (const [options, status] of [[{ unauthorized: true }, 401], [{ role: 'dealer' }, 403], [{ inactive: true }, 403]]) {
    const f = fixture(options); assert.equal((await f.request()).status, status); assert.ok(!f.calls.some(c => c.path.startsWith('/storage') || c.path.includes('/rpc/')));
  }
});
test('bad MIME/PDF and declared or streamed oversize uploads never create document metadata', async () => {
  for (const [options, status] of [[{ type: 'text/plain' }, 415], [{ bytes: new TextEncoder().encode('fake.pdf') }, 415],
    [{ declaredSize: MAX_PDF_BYTES + 1 }, 413], [{ bytes: new Uint8Array(MAX_PDF_BYTES + 1), declaredSize: 1 }, 413], [{ missing: true }, 404]]) {
    const f = fixture(options); assert.equal((await f.request()).status, status); assert.ok(!f.calls.some(c => c.path.includes('/rpc/')));
  }
});
test('metadata conflicts and uncertain outcomes preserve stored objects and do not leak keys or DB details', async () => {
  for (const [options, status] of [[{ conflict: true }, 409], [{ uncertain: true }, 502]]) {
    const f = fixture(options), response = await f.request(); assert.equal(response.status, status);
    const text = await response.text(); assert.ok(!text.includes('server-only-test-key') && !text.includes('DB detail')); assert.match(text, /same|existing/);
    assert.ok(!f.calls.some(c => c.init.method === 'DELETE'));
  }
});

test('retry after uncertain publication keeps the exact UUID/payload with no upload, overwrite or deletion', async () => {
  const options = { uncertain: true }, f = fixture(options);
  assert.equal((await f.request()).status, 502); options.uncertain = false;
  const recovered = await f.request(); assert.equal(recovered.status, 200); assert.equal((await recovered.json()).id, documentId);
  const registrations = f.calls.filter(c => c.path.includes('/rpc/')); assert.equal(registrations.length, 2);
  assert.equal(registrations[0].init.body, registrations[1].init.body);
  assert.ok(f.calls.filter(c => c.path.startsWith('/storage')).every(c => !c.init.method || c.init.method === 'GET'));
});

test('admin deactivation during PDF fetch is rechecked before registration and retains the upload', async () => {
  const f = fixture({ revokeDuringFetch: true }), response = await f.request();
  assert.equal(response.status, 403); assert.ok(f.calls.some(c => c.path.startsWith('/storage')));
  assert.ok(!f.calls.some(c => c.path.includes('/rpc/') || c.init.method === 'DELETE'));
});
test('origin, method, malformed JSON schema and body limits fail closed', async () => {
  const f = fixture(); assert.equal((await f.request(input, { Origin: 'https://attacker.example' })).status, 403); assert.equal(f.calls.length, 0);
  assert.equal((await f.request(input, {}, 'GET')).status, 405);
  assert.equal((await f.request(input, { Origin: 'https://prepaiddealersportal.netlify.app' }, 'OPTIONS')).status, 204);
  assert.equal((await f.request({ ...input, uploadedBy: actor })).status, 400);
  assert.equal((await f.request({ ...input, fileName: 'x'.repeat(2000) })).status, 413);
});
