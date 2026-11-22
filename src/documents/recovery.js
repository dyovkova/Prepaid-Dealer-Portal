import { isProductId } from '../draft/model.js';
import { MAX_PDF_BYTES, safePdfName, documentError } from './model.js';
export function uploadKey(userId, orderId) {
  if (!isProductId(userId) || !isProductId(orderId)) throw documentError('A verified account and order are required.');
  return `pdp:document-upload:v1:niabpabsvdgxackjjcsb:${userId}:${orderId}`;
}
function clean(record, orderId) {
  if (record?.version !== 1 || record.orderId !== orderId || !isProductId(record.id) || !safePdfName(record.fileName)
    || !Number.isInteger(record.size) || record.size < 1 || record.size > MAX_PDF_BYTES || !/^[a-f0-9]{64}$/.test(record.digest)
    || !['prepared', 'uploaded', 'confirmed'].includes(record.phase)) throw documentError('The saved PDF request is unreadable. Keep browser data and ask the demo operator to review it.');
  return { version: 1, id: record.id, orderId, fileName: record.fileName, size: record.size, digest: record.digest, phase: record.phase };
}
export function readUpload(userId, orderId) {
  try { const raw = localStorage.getItem(uploadKey(userId, orderId)); return raw === null ? null : clean(JSON.parse(raw), orderId); }
  catch (error) { throw error.code === 'document_local' ? error : documentError('Saved PDF requests cannot be read. Keep browser data and ask the demo operator to review it.'); }
}
export function writeUpload(userId, record) {
  const value = clean(record, record.orderId), previous = readUpload(userId, record.orderId);
  if (previous && JSON.stringify({ ...previous, phase: value.phase }) !== JSON.stringify(value)) throw documentError('A saved PDF request cannot be replaced. Retry it unchanged.');
  if (previous?.phase === 'confirmed' && value.phase !== 'confirmed') throw documentError('This PDF was already confirmed.');
  try { localStorage.setItem(uploadKey(userId, record.orderId), JSON.stringify(value)); }
  catch { throw documentError('The PDF request could not be saved. Nothing new can be sent safely; check browser storage and retry.'); }
  return value;
}
export function startAnotherUpload(userId, orderId, expectedId) {
  const saved = readUpload(userId, orderId);
  if (!saved || saved.id !== expectedId || saved.phase !== 'confirmed') throw documentError('An unresolved PDF request cannot be cleared.');
  try { localStorage.removeItem(uploadKey(userId, orderId)); } catch { throw documentError('The confirmed receipt could not be cleared.'); }
}
