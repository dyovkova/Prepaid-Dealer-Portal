import { getSupabase } from './supabase.js';
import { sessionAuthorization } from './session.js';
import { isProductId as isUuid } from '../draft/model.js';
import { adminOrder, adminOrderPath, listOptions, literalPattern, nextStatuses, ADMIN_ORDER_PAGE_SIZE } from '../admin-orders/model.js';

const fields = 'id,dealer_id,status,created_at,note,organization:dealers!orders_dealer_fk!inner(id,name),order_items(product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot)';
async function authorization(account) {
  if (account?.role !== 'admin' || account.status !== 'active' || !isUuid(account.userId)) {
    throw Object.assign(new Error('Active administrator required'), { code: 'admin_required' });
  }
  return sessionAuthorization(account.userId);
}
const signalFor = signal => AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
export async function loadAdminOrders(account, options = {}, signal) {
  const { search, status, page } = listOptions(options), header = await authorization(account);
  let query = getSupabase().from('orders').select(fields, { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (search) query = isUuid(search) ? query.eq('id', search.toLowerCase()) : query.ilike('organization.name', literalPattern(search));
  const start = page * ADMIN_ORDER_PAGE_SIZE;
  const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(start, start + ADMIN_ORDER_PAGE_SIZE - 1).setHeader('Authorization', header).abortSignal(signalFor(signal));
  if (result.error) throw Object.assign(result.error, { status: result.status });
  if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error('Orders unavailable');
  return { orders: result.data.map(adminOrder), count: result.count };
}
export async function loadAdminOrder(account, id, signal) {
  adminOrderPath(id);
  const header = await authorization(account);
  const { data, error, status } = await getSupabase().from('orders').select(fields).eq('id', id)
    .setHeader('Authorization', header).abortSignal(signalFor(signal)).maybeSingle();
  if (error) throw Object.assign(error, { status });
  return data ? adminOrder(data) : null;
}
export async function transitionAdminOrder(account, order, next) {
  adminOrderPath(order.id);
  if (!nextStatuses(order.status).includes(next)) throw Object.assign(new Error('Invalid transition'), { code: '22023' });
  const header = await authorization(account);
  const { data, error, status } = await getSupabase().rpc('transition_order_status', {
    p_order_id: order.id, p_expected_status: order.status, p_new_status: next,
  }).setHeader('Authorization', header).abortSignal(signalFor());
  if (error) throw Object.assign(error, { status });
  if (data !== order.id) throw new Error('Status change unconfirmed');
}
