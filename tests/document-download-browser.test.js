// Real local Chrome HTTP cache check; provider calls are mocks, not hosted CDN proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { createDownloader } from '../supabase/functions/download-order-document/handler.js';

test('Chrome repeats authorization after warming a no-store PDF, then denies the same JWT after profile/organization deactivation', { timeout: 30000 }, async () => {
  const user = '00000000-0000-4000-8000-000000000001', order = '00000000-0000-4000-8000-000000000002';
  const document = '00000000-0000-4000-8000-000000000003', organization = '00000000-0000-4000-8000-000000000004';
  const bytes = new TextEncoder().encode('%PDF-1.7\nSynthetic browser fixture\n%%EOF');
  const state = { active: true, organizationActive: true, requests: 0, storageReads: 0 };
  const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  const handler = createDownloader({ url: 'https://project.example', publicKey: 'test-public-key', secretKey: 'server-only-test-key', fetcher: async url => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return json({ id: user });
    if (path.startsWith('/rest/v1/profiles')) return json([{ id: user, dealer_id: organization, is_active: state.active }]);
    if (path.startsWith('/rest/v1/user_roles')) return json([{ role: 'dealer' }]);
    if (path.startsWith('/rest/v1/dealers')) return json([{ id: organization, is_active: state.organizationActive }]);
    if (path.startsWith('/rest/v1/orders')) return json([{ id: order, dealer_id: organization }]);
    if (path.startsWith('/rest/v1/order_documents')) return json([{ id: document, order_id: order, object_path: `${order}/${document}.pdf`, file_name: 'Cache verification.pdf', byte_size: bytes.length }]);
    if (path.startsWith('/storage/')) { state.storageReads++; return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'CF-Cache-Status': 'HIT' } }); }
    throw new Error('Unexpected fixture request');
  } });
  const server = createServer(async (incoming, outgoing) => {
    if (incoming.url !== '/download') { outgoing.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); outgoing.end('<!doctype html><title>Synthetic download cache verification</title>'); return; }
    state.requests++; const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const response = await handler(new Request('http://127.0.0.1:4174/download', { method: incoming.method, headers: incoming.headers,
      ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4174, '127.0.0.1', resolve); });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage(), pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('http://127.0.0.1:4174/');
    const download = () => page.evaluate(async id => {
      const response = await fetch('/download', { method: 'POST', headers: { Authorization: 'Bearer test.user.signature', 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: id }) });
      return { status: response.status, cache: response.headers.get('cache-control'), cdn: response.headers.get('cdn-cache-control'), body: await response.text() };
    }, document);
    for (const field of ['active', 'organizationActive']) {
      for (let i = 0; i < 2; i++) { const warm = await download(); assert.equal(warm.status, 200); assert.match(warm.cache, /no-store/); assert.equal(warm.cdn, 'no-store'); }
      const previousRequests = state.requests, previousStorage = state.storageReads; state[field] = false;
      const denied = await download(); assert.equal(denied.status, 403); assert.match(denied.cache, /no-store/); assert.ok(!denied.body.includes('%PDF'));
      assert.equal(state.requests, previousRequests + 1, 'Browser must contact the endpoint rather than reuse PDF bytes');
      assert.equal(state.storageReads, previousStorage, 'Denied caller must not fetch even a warm private Storage response'); state[field] = true;
    }
    assert.deepEqual(pageErrors, []);
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
