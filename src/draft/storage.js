import { isProductId, validateItems } from './model.js';

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
  const clean = validateItems(items);
  try { localStorage.setItem(draftKey(userId), JSON.stringify({ version: 1, items: clean })); }
  catch { throw new Error('Your change was not saved. Local draft storage is unavailable or full.'); }
  window.dispatchEvent(new Event('pdp:draft-updated'));
}

export function clearDraft(userId) {
  try { localStorage.removeItem(draftKey(userId)); }
  catch { throw new Error('The draft could not be cleared. Check your browser storage settings.'); }
  window.dispatchEvent(new Event('pdp:draft-updated'));
}

export function discardDraft(userId) {
  // Logout must still finish if local storage is unavailable. Keys remain scoped.
  if (userId) { try { clearDraft(userId); } catch { /* Browser storage is unavailable. */ } }
}
