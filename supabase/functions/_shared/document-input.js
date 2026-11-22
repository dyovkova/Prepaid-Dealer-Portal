export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const BUCKET = 'order-documents';
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export const safeFilename = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,115}\.pdf$/.test(value) && !value.includes('..');
export const failure = (status, message) => Object.assign(new Error(message), { status });
export function documentInput(value) {
  if (!value || Object.keys(value).sort().join() !== 'documentId,fileName,orderId'
    || !isUuid(value.orderId) || !isUuid(value.documentId) || !safeFilename(value.fileName))
    throw failure(400, 'Use valid order/document UUIDs and a safe PDF filename.');
  return { ...value, path: `${value.orderId}/${value.documentId}.pdf` };
}
export async function readBounded(body, limit = MAX_PDF_BYTES) {
  if (!body) throw failure(400, 'Empty request or file.');
  const reader = body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw failure(413, 'File or request exceeds its size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw failure(400, 'Empty request or file.');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
