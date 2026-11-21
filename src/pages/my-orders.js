import { initPage } from '../utils/init-page.js';
import { loadOrderHistory } from '../services/order-history.js';
import { historyCard, historyError } from '../orders/history-ui.js';
import { feedback } from '../draft/ui.js';

const list = document.querySelector('#order-list'), state = document.querySelector('#history-state');
const retry = document.querySelector('#retry-orders'), pagination = document.querySelector('#history-pagination');
const previous = document.querySelector('#previous-orders'), next = document.querySelector('#next-orders');
let account, request, owner, page = 0;
async function activate(value) {
  request?.abort(); account = value; list.replaceChildren(); list.setAttribute('aria-busy', 'false');
  retry.hidden = true; pagination.hidden = true; document.querySelector('#empty-history').hidden = true;
  feedback(state, '');
  if (!account || account.role !== 'dealer' || account.status !== 'active') return;
  if (owner !== account.userId) { page = 0; owner = account.userId; }
  const current = request = new AbortController();
  feedback(state, 'Loading organization orders…'); list.setAttribute('aria-busy', 'true');
  try {
    const result = await loadOrderHistory(account, { page, signal: current.signal });
    if (current.signal.aborted) return;
    list.replaceChildren(...result.orders.map(historyCard)); feedback(state, '');
    document.querySelector('#empty-history').hidden = Boolean(result.orders.length);
    document.querySelector('#empty-history-message').textContent = page
      ? 'No orders on this page. Go back or refresh to check the newest requests.'
      : 'Your organization has no submitted orders yet. You can prepare a draft from the catalog.';
    previous.disabled = page === 0; next.disabled = !result.hasMore;
    pagination.hidden = !result.orders.length && !page;
    document.querySelector('#history-page').textContent = `Page ${page + 1}`;
  } catch (error) {
    if (!current.signal.aborted) { feedback(state, historyError(error), 'danger'); retry.hidden = false; }
  } finally { if (!current.signal.aborted) list.setAttribute('aria-busy', 'false'); }
}
retry.addEventListener('click', () => { void activate(account); });
document.querySelector('#refresh-orders').addEventListener('click', () => { page = 0; void activate(account); });
previous.addEventListener('click', () => { if (page) { page--; void activate(account); } });
next.addEventListener('click', () => { page++; void activate(account); });
void initPage('my-orders', value => { void activate(value); });
