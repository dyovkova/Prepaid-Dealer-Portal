import { isProductId, validateItems } from './model.js';
import { readOrderRequest, removeOrderRequest, assertDraftEditable, blocksDraft, orderItems } from '../orders/request.js';

const prefix = 'pdp:order-draft:v1:niabpabsvdgxackjjcsb:';
export function draftKey(userId) {
  if (!isProductId(userId)) throw new Error('A verified user is required for a draft.');
  return prefix + userId;
}

export function readDraft(userId) {
  let raw;
  try { raw = localStorage.getItem(draftKey(userId)); }
  catch { throw new Error('Local draft storage is unavailable. Check your browser settings.'); }
  if (raw === null) return [];
  try {
    const saved = JSON.parse(raw);
    if (saved.version !== 1) throw new Error('Invalid version');
    return validateItems(saved.items);
  } catch { throw new Error('The saved draft could not be read. Clear it to start again.'); }
}

export function writeDraft(userId, items) {
  assertDraftEditable(userId);
  const clean = validateItems(items);
  try { localStorage.setItem(draftKey(userId), JSON.stringify({ version: 1, items: clean })); }
  catch { throw new Error('Your change was not saved. Local draft storage is unavailable or full.'); }
  window.dispatchEvent(new Event('pdp:draft-updated'));
}

export function clearDraft(userId) {
  assertDraftEditable(userId);
  try { localStorage.removeItem(draftKey(userId)); }
  catch { throw new Error('The draft could not be cleared. Check your browser storage settings.'); }
  window.dispatchEvent(new Event('pdp:draft-updated'));
}

export function discardDraft(userId) {
  // An unresolved outcome must survive logout; retry data stays owner-scoped.
  if (userId) { try {
    const record = readOrderRequest(userId);
    if (blocksDraft(record)) return;
    clearDraft(userId);
    if (record) removeOrderRequest(userId, record.payload.p_request_id);
  } catch { /* Logout still finishes if local storage is unavailable. */ } }
}

export function clearConfirmedDraft(userId, requestId) {
  const saved = readOrderRequest(userId);
  if (saved?.status !== 'confirmed' || saved.payload.p_request_id !== requestId) throw new Error('Order confirmation is required before clearing.');
  if (JSON.stringify(orderItems(readDraft(userId))) !== JSON.stringify(saved.payload.p_items)) return false;
  try { localStorage.removeItem(draftKey(userId)); }
  catch { throw new Error('Confirmed order draft could not be cleared.'); }
  window.dispatchEvent(new Event('pdp:draft-updated'));
  return true;
}
