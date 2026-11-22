import { failure, readBounded } from './document-input.js';
const origins = new Set(['https://prepaiddealersportal.netlify.app', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://127.0.0.1:4174']);
export function responseHeaders(request) {
  const origin = request.headers.get('origin');
  return { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store', 'Surrogate-Control': 'no-store', Pragma: 'no-cache', Expires: '0',
    'X-Content-Type-Options': 'nosniff', Vary: 'Origin, Authorization',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Disposition', ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
}
export function checkRequest(request) {
  const origin = request.headers.get('origin');
  if (origin && !origins.has(origin)) throw failure(403, 'Origin is not allowed.');
  if (!['POST', 'OPTIONS'].includes(request.method)) throw failure(405, 'Use POST.');
}
export async function requestJson(request) {
  try { return JSON.parse(new TextDecoder().decode(await readBounded(request.body, 1024))); }
  catch (error) { if (error.status) throw error; throw failure(400, 'Invalid JSON request.'); }
}
export const errorResponse = (error, headers) => new Response(JSON.stringify({ error: error.status ? error.message : 'Document operation is unavailable; retain its existing ID.' }), { status: error.status ?? 502, headers });
