import { documentInput, failure, validatePdf } from './pdf.js';
import { createDocumentAuthorization } from '../_shared/document-auth.js';
import { createPrivateDocumentReader } from '../_shared/document-storage.js';
import { responseHeaders, checkRequest, requestJson, errorResponse } from '../_shared/document-http.js';

export function createPublisher(config) {
  const { url, secretKey, fetcher = fetch } = config;
  const access = createDocumentAuthorization(config), readFile = createPrivateDocumentReader(config);
  return async request => {
    const headers = responseHeaders(request);
    try {
      checkRequest(request); if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const caller = await access.verify(request), document = documentInput(await requestJson(request));
      await access.upload(caller, document);
      const { bytes, type } = await readFile(document.path); await validatePdf(bytes, type);
      const currentCaller = await access.verify(request);
      if (currentCaller.id !== caller.id) throw failure(403, 'Account changed.');
      await access.upload(currentCaller, document);
      // Server key now reads authorized bytes as well; direct user downloads are denied by 012.
      const registration = await fetcher(url + '/rest/v1/rpc/register_order_document', { method: 'POST',
        headers: { apikey: secretKey, 'Content-Type': 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ p_actor_id: caller.id, p_order_id: document.orderId, p_document_id: document.documentId,
          p_file_name: document.fileName, p_byte_size: bytes.length }) });
      if (!registration.ok) {
        const error = await registration.json();
        throw failure(error.code === 'PT409' ? 409 : error.code === '42501' ? 403 : ['22023', '23514'].includes(error.code) ? 400 : 502,
          'PDF publication could not be confirmed. Retry with the same document ID and filename; the object was retained.');
      }
      if (await registration.json() !== document.documentId) throw failure(502, 'PDF publication is unconfirmed; keep its existing object and ID.');
      return new Response(JSON.stringify({ id: document.documentId, fileName: document.fileName }), { status: 200, headers });
    } catch (error) { return errorResponse(error, headers); }
  };
}
