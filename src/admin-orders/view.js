import { historyCard, renderOrderDetails } from '../orders/history-ui.js';
import { orderStatuses } from '../orders/history-model.js';
import { adminOrderPath, nextStatuses } from './model.js';

export function adminOrderCard(order) {
  const card = historyCard(order); card.querySelector('a').href = adminOrderPath(order.id);
  card.querySelector('.form-note').textContent = 'Order number';
  const organization = document.createElement('p'); organization.className = 'text-secondary product-description';
  organization.dataset.organization = ''; organization.textContent = `Organization: ${order.organizationName}`;
  card.querySelector('[data-date]').before(organization); return card;
}
export function renderAdminOrder(order) {
  renderOrderDetails(order);
  document.querySelector('#order-organization').textContent = order.organizationName;
  const actions = document.querySelector('#status-actions'); actions.replaceChildren();
  for (const next of nextStatuses(order.status)) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.nextStatus = next;
    button.className = next === 'rejected' ? 'btn btn-outline-danger' : 'btn btn-primary';
    button.textContent = next === 'processing' ? 'Start processing' : next === 'completed' ? 'Complete order' : 'Reject order'; actions.append(button);
  }
  document.querySelector('#status-help').textContent = nextStatuses(order.status).length
    ? 'Confirm each status change. Only status is updated; saved order information stays unchanged.'
    : 'This order is terminal and read-only. Its status cannot be changed.';
}
export function confirmTransition(order, next) {
  const dialog = document.querySelector('#order-confirm');
  dialog.querySelector('h2').textContent = next === 'rejected' ? 'Reject this order?' : 'Update order status?';
  dialog.querySelector('p').textContent = `Order ${order.id}: ${orderStatuses[order.status].label} to ${orderStatuses[next].label}. `
    + (next === 'completed' || next === 'rejected' ? 'This is a terminal status and cannot be reversed.' : 'Saved quantities, prices and ownership will stay unchanged.');
  dialog.querySelector('[value="confirm"]').textContent = next === 'rejected' ? 'Confirm rejection' : 'Confirm update';
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
