import { orderStatuses, orderPath, orderDate, savedEuros } from './history-model.js';

function statusBadge(status) {
  const badge = document.createElement('span'), value = orderStatuses[status];
  badge.className = `badge text-bg-${value.style}`; badge.textContent = value.label;
  return badge;
}
function dateElement(date) {
  const time = document.createElement('time'); time.dateTime = date.toISOString(); time.textContent = orderDate(date);
  return time;
}
export function historyCard(order) {
  const li = document.createElement('li'); li.className = 'col-lg-6'; li.dataset.orderId = order.id;
  li.innerHTML = `<article class="card h-100"><div class="card-body">
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3"><span class="form-note">Order reference</span><span data-status></span></div>
    <h3 class="order-reference mb-3"><a></a></h3><p class="text-secondary" data-date></p>
    <dl class="mb-0"><div class="summary-row"><dt>Items</dt><dd data-count></dd></div>
      <div class="summary-row"><dt>Saved total</dt><dd class="order-total"></dd></div></dl>
  </div></article>`;
  const link = li.querySelector('a'); link.href = orderPath(order.id); link.textContent = order.id;
  link.setAttribute('aria-label', `View order ${order.id}`);
  li.querySelector('[data-status]').append(statusBadge(order.status));
  li.querySelector('[data-date]').append(dateElement(order.createdAt));
  li.querySelector('[data-count]').textContent = `${order.itemCount} product${order.itemCount === 1 ? '' : 's'} · ${order.units} unit${order.units === 1 ? '' : 's'}`;
  li.querySelector('.order-total').textContent = savedEuros(order.totalCents);
  return li;
}
function savedItem(item) {
  const row = document.createElement('article'); row.className = 'card mb-3'; row.dataset.productId = item.productId;
  row.innerHTML = `<div class="card-body"><h3 class="product-description"></h3><p class="form-note product-sku"></p>
    <dl class="draft-item-values mb-0"><div><dt class="form-note">Quantity</dt><dd data-quantity></dd></div>
    <div><dt class="form-note">Saved unit price</dt><dd data-price></dd></div>
    <div><dt class="form-note">Line total</dt><dd class="line-total"></dd></div></dl></div>`;
  row.querySelector('h3').textContent = item.name;
  row.querySelector('.product-sku').textContent = `SKU: ${item.sku}`;
  row.querySelector('[data-quantity]').textContent = item.quantity;
  row.querySelector('[data-price]').textContent = savedEuros(item.cents);
  row.querySelector('.line-total').textContent = savedEuros(item.lineCents);
  return row;
}
export function renderOrderDetails(order) {
  document.querySelector('#order-reference').textContent = order.id;
  document.querySelector('#saved-status').replaceChildren(statusBadge(order.status));
  document.querySelector('#saved-date').replaceChildren(dateElement(order.createdAt));
  document.querySelector('#saved-count').textContent = order.itemCount;
  document.querySelector('#saved-units').textContent = order.units;
  document.querySelector('#order-total').textContent = savedEuros(order.totalCents);
  document.querySelector('#saved-note').textContent = order.note?.trim() || 'No note included.';
  document.querySelector('#saved-items').replaceChildren(...order.items.map(savedItem));
}
export function historyError(error) {
  return error.code === '42501' || [401, 403].includes(error.status)
    ? 'Order access was denied. Check your account status or sign in again, then retry.'
    : 'Could not load saved orders. Check your connection and retry.';
}
