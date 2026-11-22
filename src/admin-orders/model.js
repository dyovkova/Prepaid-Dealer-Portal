import { isProductId as isUuid } from '../draft/model.js';
import { savedOrder, orderStatuses } from '../orders/history-model.js';

export const ADMIN_ORDER_PAGE_SIZE = 10;
const transitions = { submitted: ['processing', 'rejected'], processing: ['completed', 'rejected'], completed: [], rejected: [] };
export const nextStatuses = status => Object.hasOwn(transitions, status) ? [...transitions[status]] : [];
export function adminOrderPath(id) {
  if (!isUuid(id)) throw new Error('Invalid order number');
  return `/admin/orders/?id=${encodeURIComponent(id)}`;
}
export function adminOrder(row) {
  if (!row || !isUuid(row.dealer_id) || row.organization?.id !== row.dealer_id
    || typeof row.organization.name !== 'string' || !row.organization.name.trim()) throw new Error('Order organization unavailable');
  return { ...savedOrder(row, row.dealer_id), dealerId: row.dealer_id, organizationName: row.organization.name };
}
export function listOptions({ search = '', status = 'all', page = 0 } = {}) {
  if (typeof search !== 'string' || search.trim().length > 160 || (status !== 'all' && !Object.hasOwn(orderStatuses, status))
    || !Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger((page + 1) * ADMIN_ORDER_PAGE_SIZE)) throw new Error('Invalid order filters');
  return { search: search.trim(), status, page };
}
export function listState(search) {
  const p = new URLSearchParams(search), page = Number(p.get('page') ?? '1') - 1;
  try { return listOptions({ search: p.get('q') ?? '', status: p.get('status') ?? 'all', page }); }
  catch { return listOptions(); }
}
export const literalPattern = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
export const isOrderConflict = error => error.code === 'PT409' || error.status === 409;
export function adminOrderError(error, writing = false) {
  if (isOrderConflict(error)) return 'Another administrator changed this order. Reloading the latest order; your change was not retried.';
  if (['42501', 'portal_session', 'admin_required'].includes(error.code) || [401, 403].includes(error.status)) return 'Administrator access is unavailable. Check your session and reload.';
  if (error.code === '22023') return 'That status change is not allowed. Reload the order and review its current status.';
  return writing ? 'Could not confirm the status change. Reloading the order; no automatic retry was sent.'
    : 'Could not load orders. Check your connection and reload.';
}
