import { BUCKET, MAX_PDF_BYTES, failure, readBounded } from './document-input.js';
// Only call after current caller authorization. No caller-supplied URLs or redirects.
export function createPrivateDocumentReader({ url, secretKey, fetcher = fetch }) {
  return async path => {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$/.test(path)) throw failure(400, 'Invalid document path.');
    const file = await fetcher(`${url}/storage/v1/object/authenticated/${BUCKET}/${path}`, {
      headers: { apikey: secretKey, 'Cache-Control': 'no-cache' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!file.ok) throw failure([400, 403, 404].includes(file.status) ? 404 : 502, 'Stored PDF is unavailable.');
    if (Number(file.headers.get('content-length')) > MAX_PDF_BYTES) { await file.body?.cancel(); throw failure(413, 'PDF exceeds 10 MiB.'); }
    return { bytes: await readBounded(file.body), type: file.headers.get('content-type') ?? '' };
  };
}
