import { readDraft, draftKey } from './storage.js';

let owner;
export function updateDraftCounter(account) {
  owner = account?.role === 'dealer' && account.status === 'active' ? account.userId : null;
  refresh();
}
function refresh() {
  let count = 0;
  try { if (owner) count = readDraft(owner).length; } catch { count = '—'; }
  for (const badge of document.querySelectorAll('[data-draft-count]')) {
    badge.textContent = count;
    badge.setAttribute('aria-label', count === '—' ? 'Draft unavailable' : `${count} draft products`);
  }
}
window.addEventListener('pdp:draft-updated', refresh);
window.addEventListener('storage', event => {
  if (owner && (event.key === null || event.key === draftKey(owner))) refresh();
});
