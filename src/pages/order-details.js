import { initPage } from '../utils/init-page.js';
import { loadOrderDetails } from '../services/order-history.js';
import { orderIdFromSearch } from '../orders/history-model.js';
import { renderOrderDetails, historyError } from '../orders/history-ui.js';
import { feedback } from '../draft/ui.js';
import { createDocuments } from '../documents/controller.js';

const content = document.querySelector('#order-content'), state = document.querySelector('#details-state');
const retry = document.querySelector('#retry-order');
let account, request;
const documents = createDocuments(document.querySelector('#order-documents'));
async function activate(value) {
  documents.setContext(null);
  request?.abort(); account = value; content.hidden = true; retry.hidden = true;
  document.querySelector('#saved-items').replaceChildren();
  for (const id of ['order-reference', 'saved-status', 'saved-date', 'saved-count', 'saved-units', 'order-total', 'saved-note']) document.getElementById(id).textContent = '';
  content.setAttribute('aria-busy', 'false'); feedback(state, '');
  if (!account || account.role !== 'dealer' || account.status !== 'active') return;
  const id = orderIdFromSearch(location.search);
  if (!id) { feedback(state, 'Invalid order link. Open My orders and choose a valid order reference.', 'warning'); return; }
  const current = request = new AbortController();
  feedback(state, 'Loading saved order…'); content.setAttribute('aria-busy', 'true');
  try {
    const order = await loadOrderDetails(account, id, { signal: current.signal });
    if (current.signal.aborted) return;
    if (!order) { feedback(state, 'Order unavailable. It may not exist or may not be accessible to your organization.', 'warning'); return; }
    renderOrderDetails(order); content.hidden = false; feedback(state, ''); documents.setContext(account, id);
  } catch (error) {
    if (!current.signal.aborted) { feedback(state, historyError(error), 'danger'); retry.hidden = false; }
  } finally { if (!current.signal.aborted) content.setAttribute('aria-busy', 'false'); }
}
retry.addEventListener('click', () => { void activate(account); });
void initPage('order-details', value => { void activate(value); });
