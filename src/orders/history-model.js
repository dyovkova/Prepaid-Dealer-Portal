import { isProductId as isUuid } from '../draft/model.js';

export const orderStatuses = {
  submitted: { label: 'Submitted', style: 'primary' }, processing: { label: 'Processing', style: 'warning' },
  completed: { label: 'Completed', style: 'success' }, rejected: { label: 'Rejected', style: 'danger' },
};
export function orderIdFromSearch(search) {
  const ids = new URLSearchParams(search).getAll('id');
  return ids.length === 1 && isUuid(ids[0]) ? ids[0].toLowerCase() : null;
}
export function orderPath(id) {
  if (!isUuid(id)) throw new Error('Invalid order reference');
  return `/order-details/?id=${encodeURIComponent(id)}`;
}
export function savedCents(value) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid saved unit price');
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (cents > 999999999999n) throw new Error('Invalid saved unit price');
  return cents;
}
export function savedEuros(cents) {
  if (typeof cents !== 'bigint' || cents < 0n) throw new Error('Invalid saved total');
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
    .formatToParts(cents / 100n).map(part => part.type === 'fraction' ? String(cents % 100n).padStart(2, '0') : part.value).join('');
}
export const orderDate = date => new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
export function savedOrder(row, organizationId) {
  if (!row || !isUuid(row.id) || row.dealer_id !== organizationId
    || !Object.hasOwn(orderStatuses, row.status) || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
    || (row.note !== null && (typeof row.note !== 'string' || row.note.length > 2000))
    || !Array.isArray(row.order_items) || !row.order_items.length || row.order_items.length > 100) throw new Error('Saved order data is invalid');
  const ids = new Set();
  const items = row.order_items.map(line => {
    if (!line || !isUuid(line.product_id) || ids.has(line.product_id.toLowerCase())
      || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 2147483647
      || !['sku_snapshot', 'name_snapshot'].every(key => typeof line[key] === 'string' && line[key].trim())) throw new Error('Saved item data is invalid');
    ids.add(line.product_id.toLowerCase());
    const cents = savedCents(line.unit_price_snapshot);
    return { productId: line.product_id, sku: line.sku_snapshot, name: line.name_snapshot,
      quantity: line.quantity, cents, lineCents: cents * BigInt(line.quantity) };
  });
  return { id: row.id, status: row.status, createdAt: new Date(row.created_at), note: row.note,
    items, itemCount: items.length, units: items.reduce((sum, item) => sum + item.quantity, 0),
    totalCents: items.reduce((sum, item) => sum + item.lineCents, 0n) };
}
