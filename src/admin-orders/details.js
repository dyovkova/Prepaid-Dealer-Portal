import { loadAdminOrder, transitionAdminOrder } from '../services/admin-orders.js';
import { orderIdFromSearch, orderStatuses } from '../orders/history-model.js';
import { renderAdminOrder, confirmTransition } from './view.js';
import { nextStatuses, adminOrderError, isOrderConflict } from './model.js';
import { feedback } from '../draft/ui.js';

export function createOrderDetails() {
  const id = orderIdFromSearch(location.search), content = document.querySelector('#order-content');
  const state = document.querySelector('#details-state'), notice = document.querySelector('#order-feedback');
  const reload = document.querySelector('#reload-order'), actions = document.querySelector('#status-actions'), dialog = document.querySelector('#order-confirm');
  let account, order, request, generation = 0, busy = false, loading = false;
  function controls() {
    reload.disabled = !account || loading || busy || !id;
    actions.querySelectorAll('button').forEach(button => { button.disabled = !account || !order || loading || busy; });
  }
  async function load() {
    request?.abort(); order = null; content.hidden = true; actions.replaceChildren(); controls();
    if (!account) return false;
    if (!id) { feedback(state, 'Invalid order link. Open Order management and choose a valid order number.', 'warning'); return false; }
    const current = request = new AbortController(), actor = account;
    loading = true; controls(); feedback(state, 'Loading saved order...'); content.setAttribute('aria-busy', 'true');
    try {
      const result = await loadAdminOrder(actor, id, current.signal); if (current.signal.aborted) return false;
      if (!result) { feedback(state, 'Order unavailable. It may not exist or your access may have changed.', 'warning'); return false; }
      order = result; renderAdminOrder(order); content.hidden = false; feedback(state, ''); return true;
    } catch (error) { if (!current.signal.aborted) feedback(state, adminOrderError(error), 'danger'); return false; }
    finally { if (!current.signal.aborted) { loading = false; controls(); content.setAttribute('aria-busy', 'false'); } }
  }
  actions.addEventListener('click', async event => {
    const next = event.target.closest('[data-next-status]')?.dataset.nextStatus;
    if (!account || !order || busy || loading || !nextStatuses(order.status).includes(next)) return;
    const current = generation, saved = order;
    if (!await confirmTransition(saved, next) || current !== generation || busy || order !== saved) return;
    busy = true; controls(); feedback(notice, 'Updating status...');
    let message, type;
    try {
      await transitionAdminOrder(account, saved, next);
      message = `Order status updated to ${orderStatuses[next].label}.`; type = 'success';
    } catch (error) {
      message = adminOrderError(error, true); type = isOrderConflict(error) ? 'warning' : 'danger';
    }
    try {
      if (current !== generation) return;
      feedback(notice, message, type);
      const reloaded = await load();
      if (current !== generation) return;
      if (type === 'warning' && reloaded) feedback(notice, 'Another administrator changed this order. The latest order is loaded. Review it before choosing another action; your change was not retried.', 'warning');
      if (!reloaded) feedback(notice, `${message} Use Reload order before trying another status change.`, type);
    } finally { busy = false; controls(); }
  });
  reload.addEventListener('click', async () => {
    const current = generation;
    if (await load() && current === generation) feedback(notice, 'Order reloaded. Review its current status before making another change.');
  });
  return { setAccount(next) {
    generation += 1; request?.abort(); account = next; order = null; loading = false;
    if (dialog.open) dialog.close('cancel'); content.hidden = true; actions.replaceChildren();
    document.querySelector('#saved-items').replaceChildren(); feedback(notice, ''); feedback(state, ''); controls();
    for (const key of ['order-reference', 'order-organization', 'saved-status', 'saved-date', 'saved-count', 'saved-units', 'order-total', 'saved-note', 'status-help']) document.getElementById(key).textContent = '';
    content.setAttribute('aria-busy', 'false');
    if (account) void load();
  } };
}
