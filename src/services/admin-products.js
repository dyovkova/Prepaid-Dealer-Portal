import { getSupabase } from './supabase.js';
import { sessionAuthorization } from './session.js';
import { isProductId } from '../draft/model.js';
import { adminProduct, productValues } from '../admin-products/model.js';

const fields = 'id,sku,name,description,unit_price,is_active';
async function authorization(account) {
  if (account?.role !== 'admin' || account.status !== 'active' || !isProductId(account.userId)) {
    throw Object.assign(new Error('Active administrator required'), { code: 'admin_required' });
  }
  return sessionAuthorization(account.userId); // RLS remains the authorization boundary.
}
export async function loadAdminProducts(account, signal) {
  const products = [], size = 200;
  for (let start = 0; ; start += size) {
    const header = await authorization(account);
    const { data, error } = await getSupabase().from('products').select(fields)
      .setHeader('Authorization', header).order('sku').order('id').range(start, start + size - 1)
      .abortSignal(AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]));
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Product data unavailable');
    products.push(...data.map(adminProduct));
    if (data.length < size) return products;
  }
}
async function changed(query, header) {
  const { data, error, status } = await query.select(fields).setHeader('Authorization', header)
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw Object.assign(error, { status });
  if (!data) throw Object.assign(new Error('No product returned'), { code: 'product_unavailable' });
  return adminProduct(data);
}
export async function saveProduct(account, values, id = null) {
  const payload = productValues(values), header = await authorization(account);
  if (id !== null && !isProductId(id)) throw new Error('Invalid product ID');
  const table = getSupabase().from('products');
  return changed(id ? table.update(payload).eq('id', id) : table.insert(payload), header);
}
export async function setProductActive(account, id, active) {
  if (!isProductId(id) || typeof active !== 'boolean') throw new Error('Invalid product status');
  return changed(getSupabase().from('products').update({ is_active: active }).eq('id', id), await authorization(account));
}
