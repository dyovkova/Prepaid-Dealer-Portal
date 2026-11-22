import { createDocumentAuthorization } from '../_shared/document-auth.js';
import { createPrivateDocumentReader } from '../_shared/document-storage.js';
import { responseHeaders, checkRequest, requestJson, errorResponse } from '../_shared/document-http.js';
import { failure, isUuid } from '../_shared/document-input.js';

export function createDownloader(config) {
  const access = createDocumentAuthorization(config), readFile = createPrivateDocumentReader(config);
  return async request => {
    const headers = responseHeaders(request);
    try {
      checkRequest(request); if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const caller = await access.verify(request), input = await requestJson(request);
      if (!input || Object.keys(input).join() !== 'documentId' || !isUuid(input.documentId)) throw failure(400, 'Use a published document UUID only.');
      const document = await access.published(caller, input.documentId);
      const { bytes, type } = await readFile(document.object_path);
      if (type.split(';')[0].trim().toLowerCase() !== 'application/pdf' || bytes.length !== document.byte_size) throw failure(502, 'Stored PDF does not match published metadata.');
      // Recheck after fetching; never release bytes if revocation committed during that work.
      const currentCaller = await access.verify(request);
      if (currentCaller.id !== caller.id || JSON.stringify(await access.published(currentCaller, input.documentId)) !== JSON.stringify(document)) throw failure(403, 'Document access changed.');
      return new Response(bytes, { status: 200, headers: { ...headers, 'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length), 'Content-Disposition': `attachment; filename="${document.file_name}"` } });
    } catch (error) { return errorResponse(error, headers); }
  };
}
