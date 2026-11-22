import { isProductId } from '../draft/model.js';
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const documentError = message => Object.assign(new Error(message), { code: 'document_local' });
export const safePdfName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,115}\.pdf$/.test(name) && !name.includes('..');
export function validatePdfFile(file) {
  if (!file || file.type !== 'application/pdf' || !file.size || file.size > MAX_PDF_BYTES) throw documentError('Select a nonempty PDF file of at most 10 MiB.');
  if (!safePdfName(file.name)) throw documentError('Use a PDF filename starting with a letter or digit, with only English letters, digits, spaces, dots, underscores or hyphens (maximum 120 characters, lowercase .pdf).');
  return file;
}
export async function fileFingerprint(file) {
  validatePdfFile(file);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function publishedDocument(row, orderId) {
  if (!isProductId(row?.id) || row.order_id !== orderId || !safePdfName(row.file_name)
    || !Number.isInteger(row.byte_size) || row.byte_size < 1 || row.byte_size > MAX_PDF_BYTES || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid document metadata');
  return { id: row.id, orderId, name: row.file_name, size: row.byte_size, createdAt: new Date(row.created_at) };
}
export function documentMessage(error) {
  if (['document_local', 'portal_session'].includes(error.code)) return error.message;
  if ([401, 403].includes(error.status) || error.code === '42501') return 'Document access denied. Your account or organization may be inactive, or your session changed. Check your account before retrying.';
  if (error.status === 415) return 'The stored PDF was rejected by server validation. Its saved reference is kept. Ask the demo operator to review the file; do not upload a replacement for this request.';
  if (error.status === 413) return 'The server rejected the file size. The saved reference is kept for review.';
  if (error.status === 409) return 'This saved document conflicts with existing metadata. Keep it unchanged and ask the demo operator to review it.';
  if (error.status === 404) return 'The document is unavailable or the upload did not finish. Keep the saved reference; reselect the same original PDF if an upload retry is needed.';
  return 'The operation could not be confirmed. Any saved upload is kept with its exact reference. Retry it unchanged after checking your connection.';
}
