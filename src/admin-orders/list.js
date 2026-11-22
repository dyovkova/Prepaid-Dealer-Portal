import { loadAdminOrders } from '../services/admin-orders.js';
import { adminOrderCard } from './view.js';
import { listState, adminOrderError, ADMIN_ORDER_PAGE_SIZE } from './model.js';
import { feedback } from '../draft/ui.js';

export function createOrderList() {
  const form = document.querySelector('#order-search-form'), search = form.elements.namedItem('q'), filter = form.elements.namedItem('status');
  const list = document.querySelector('#admin-order-list'), state = document.querySelector('#orders-state');
  const previous = document.querySelector('#orders-previous'), next = document.querySelector('#orders-next'), reload = document.querySelector('#reload-orders');
  const initial = listState(location.search); search.value = initial.search; filter.value = initial.status;
  let account, request, page = initial.page, count = 0, loaded = false, loading = false;
  function controls() {
    const blocked = !account || loading; form.querySelector('fieldset').disabled = blocked; reload.disabled = blocked;
    previous.disabled = blocked || !loaded || page === 0; next.disabled = blocked || !loaded || (page + 1) * ADMIN_ORDER_PAGE_SIZE >= count;
  }
  async function load() {
    request?.abort(); if (!account) return;
    const current = request = new AbortController(), actor = account;
    loading = true; loaded = false; list.replaceChildren(); controls(); list.setAttribute('aria-busy', 'true');
    document.querySelector('#orders-page').textContent = ''; feedback(state, 'Loading orders...');
    const options = { search: search.value, status: filter.value, page };
    const params = new URLSearchParams(); if (options.search.trim()) params.set('q', options.search.trim());
    if (options.status !== 'all') params.set('status', options.status); if (page) params.set('page', String(page + 1));
    history.replaceState(null, '', `/admin/orders/${params.size ? '?' + params : ''}`);
    try {
      const result = await loadAdminOrders(actor, options, current.signal); if (current.signal.aborted) return;
      count = result.count; loaded = true; list.replaceChildren(...result.orders.map(adminOrderCard));
      document.querySelector('#orders-page').textContent = count ? `Page ${page + 1} of ${Math.ceil(count / ADMIN_ORDER_PAGE_SIZE)} - ${count} orders` : '0 orders';
      feedback(state, result.orders.length ? '' : 'No orders match your search, status or page.');
    } catch (error) { if (!current.signal.aborted) feedback(state, adminOrderError(error), 'danger'); }
    finally { if (!current.signal.aborted) { loading = false; controls(); list.setAttribute('aria-busy', 'false'); } }
  }
  form.addEventListener('submit', event => { event.preventDefault(); if (loading) return; page = 0; void load(); });
  filter.addEventListener('change', () => { page = 0; void load(); });
  previous.addEventListener('click', () => { page -= 1; void load(); }); next.addEventListener('click', () => { page += 1; void load(); });
  reload.addEventListener('click', () => { void load(); });
  return { setAccount(nextAccount) {
    request?.abort(); account = nextAccount; loaded = loading = false; list.replaceChildren(); controls();
    list.setAttribute('aria-busy', 'false');
    document.querySelector('#orders-page').textContent = ''; feedback(state, '');
    if (account) void load();
  } };
}
