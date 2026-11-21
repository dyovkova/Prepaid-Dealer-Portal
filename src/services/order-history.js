import { getSupabase } from './supabase.js';
import { savedOrder, orderPath } from '../orders/history-model.js';

export const HISTORY_PAGE_SIZE = 20;
const fields = 'id,dealer_id,status,created_at,note,order_items(product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot)';
function queryFor(account, signal) {
  if (account?.role !== 'dealer' || account.status !== 'active' || !account.profile?.dealer_id) throw new Error('An active dealer account is required');
  // The organization filter also protects stale-session/account switches; RLS is authoritative.
  return getSupabase().from('orders').select(fields).eq('dealer_id', account.profile.dealer_id)
    .abortSignal(AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]));
}
export async function loadOrderHistory(account, { page = 0, signal } = {}) {
  if (!Number.isSafeInteger(page) || page < 0) throw new Error('Invalid history page');
  const start = page * HISTORY_PAGE_SIZE;
  const { data, error, status } = await queryFor(account, signal).order('created_at', { ascending: false })
    .order('id', { ascending: false }).range(start, start + HISTORY_PAGE_SIZE);
  if (error) throw Object.assign(error, { status });
  if (!Array.isArray(data)) throw new Error('Order history is unavailable');
  const orders = data.map(row => savedOrder(row, account.profile.dealer_id));
  return { orders: orders.slice(0, HISTORY_PAGE_SIZE), hasMore: orders.length > HISTORY_PAGE_SIZE };
}
export async function loadOrderDetails(account, id, { signal } = {}) {
  orderPath(id); // Validate before constructing a UUID query.
  const { data, error, status } = await queryFor(account, signal).eq('id', id).maybeSingle();
  if (error) throw Object.assign(error, { status });
  return data ? savedOrder(data, account.profile.dealer_id) : null;
}
