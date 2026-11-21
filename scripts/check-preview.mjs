import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

// Check the actual production server against emitted files, so an SPA fallback
// returning HTTP 200 cannot disguise a missing nested HTML entry.
const baseUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:4173');
const dist = resolve(import.meta.dirname, '../dist');
const routes = [
  ['/', 'Home'],
  ['/login/', 'Login'],
  ['/register/', 'Register'],
  ['/catalog/', 'Product Catalog'],
  ['/new-order/', 'New Order'],
  ['/my-orders/', 'My Orders'],
  ['/order-details/', 'Order Details'],
  ['/admin/', 'Admin Dashboard'],
  ['/admin/products/', 'Admin Products'],
];
const references = new Set();

async function get(path) {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, `${path} must return HTTP 200`);
  return response;
}

try {
  const files = await readdir(dist, { recursive: true });
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  const expectedFiles = routes.map(([route]) => `${route.slice(1)}index.html`);
  assert.deepEqual(htmlFiles.map((file) => file.split(sep).join('/')).sort(), expectedFiles.sort());

  for (const [route, title] of routes) {
    const file = resolve(dist, `.${route}index.html`);
    const emittedHtml = await readFile(file, 'utf8');
    const response = await get(route);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.equal(html, emittedHtml, `${route} must serve its own built entry`);
    assert.ok(html.includes(`<title>${title} | Prepaid Dealer Portal</title>`), `${route} title`);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${route} must have one page heading`);
    assert.match(html, /<script[^>]*type="module"[^>]*src="\/assets\//, `${route} must load built JavaScript`);

    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const path = match[1];
      if (path.startsWith('/')) references.add(path);
    }
    console.log(`PASS ${route} -> ${relative(dist, file)}`);
  }

  for (const path of references) {
    const response = await get(path);
    if (path.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
    if (path.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/);
    if (path.endsWith('.svg')) assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
    await response.arrayBuffer();
  }

  const detailQuery = await get('/order-details/?id=preview');
  assert.equal(await detailQuery.text(), await readFile(resolve(dist, 'order-details/index.html'), 'utf8'));
  const missing = await fetch(new URL('/not-a-portal-page/', baseUrl), { signal: AbortSignal.timeout(5000) });
  assert.equal(missing.status, 404, 'Unknown pages must not fall back to Home');
  console.log(`PASS ${references.size} linked routes/assets, order-details query URL, and unknown-route HTTP 404`);
  console.log(`Production preview checks passed for all ${routes.length} pages.`);
} catch (error) {
  console.error(`Preview check failed: ${error.message}`);
  console.error('Build first, then run npm run preview in another terminal.');
  process.exitCode = 1;
}
