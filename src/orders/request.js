import { isProductId, validateItems } from '../draft/model.js';

export const localError = message => Object.assign(new Error(message), { code: 'order_local' });
export function requestKey(userId) {
  if (!isProductId(userId)) throw localError('A verified account is required.');
  return `pdp:order-request:v1:niabpabsvdgxackjjcsb:${userId}`;
}
export const orderItems = items => validateItems(items).map(item => ({ product_id: item.productId, quantity: item.quantity }))
  .sort((a, b) => a.product_id.localeCompare(b.product_id));
export function makePayload(items, note = '', requestId = crypto.randomUUID()) {
  const lines = orderItems(items);
  if (!lines.length) throw localError('Add at least one product before submitting.');
  if (!isProductId(requestId) || (note !== null && typeof note !== 'string') || (note?.length ?? 0) > 2000) {
    throw localError('Use a valid request reference and a note of at most 2000 characters.');
  }
  return { p_request_id: requestId, p_items: lines, p_note: note?.trim() || null };
}
function validateRecord(record) {
  const p = record?.payload;
  if (!p || Object.keys(p).sort().join(',') !== 'p_items,p_note,p_request_id' || !Array.isArray(p.p_items)
    || p.p_items.some(i => !i || Object.keys(i).sort().join(',') !== 'product_id,quantity')) throw new Error('Invalid payload');
  const canonical = makePayload(p.p_items.map(i => ({ productId: i.product_id, quantity: i.quantity })), p.p_note, p.p_request_id);
  if (record.version !== 1 || !['pending', 'confirmed'].includes(record.status)
    || JSON.stringify(p) !== JSON.stringify(canonical) || typeof record.draftResolved !== 'boolean'
    || (record.status === 'pending' && (record.orderId !== null || record.draftResolved))
    || (record.status === 'confirmed' && !isProductId(record.orderId))) throw new Error('Invalid record');
  return { version: 1, status: record.status, payload: canonical, orderId: record.orderId, draftResolved: record.draftResolved };
}
export const blocksDraft = record => Boolean(record && !record.draftResolved);
export function readOrderRequest(userId) {
  let raw;
  try { raw = localStorage.getItem(requestKey(userId)); }
  catch { throw localError('Saved order requests cannot be read. Check browser storage before submitting.'); }
  if (raw === null) return null;
  try { return validateRecord(JSON.parse(raw)); }
  catch { throw localError('The saved order request is unreadable. Keep browser data and ask the demo operator to review it.'); }
}
export function writeOrderRequest(userId, record) {
  const clean = validateRecord(record);
  const previous = readOrderRequest(userId);
  if (blocksDraft(previous) && JSON.stringify(previous.payload) !== JSON.stringify(clean.payload)) {
    throw localError('An unresolved request cannot be replaced. Retry it unchanged.');
  }
  try { localStorage.setItem(requestKey(userId), JSON.stringify(clean)); }
  catch { throw localError('The order request could not be saved. Check browser storage and retry.'); }
  window.dispatchEvent(new Event('pdp:order-request-updated'));
  return clean;
}
export function removeOrderRequest(userId, expectedId) {
  const saved = readOrderRequest(userId);
  if (saved && saved.payload.p_request_id !== expectedId) throw localError('The saved request changed. Refresh before continuing.');
  try { localStorage.removeItem(requestKey(userId)); }
  catch { throw localError('The saved request could not be updated. Check browser storage.'); }
  window.dispatchEvent(new Event('pdp:order-request-updated'));
}
export function assertDraftEditable(userId) {
  if (blocksDraft(readOrderRequest(userId))) throw localError('An order is awaiting confirmation. Open New order and retry the saved request before editing this draft.');
}
