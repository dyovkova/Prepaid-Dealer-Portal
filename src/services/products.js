import { getSupabase } from './supabase.js';
import { isProductId, priceCents } from '../draft/model.js';
import { sessionAuthorization } from './session.js';

export async function loadProducts({ ids, signal } = {}) {
  if (ids && !ids.length) return [];
  if (ids && !ids.every(isProductId)) throw new Error('Invalid product selection');
  const authorization = await sessionAuthorization();
  let query = getSupabase().from('products')
    .select('id,sku,name,description,unit_price,is_active').setHeader('Authorization', authorization).eq('is_active', true).order('name');
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.abortSignal(AbortSignal.any([
    AbortSignal.timeout(15000), ...(signal ? [signal] : []),
  ]));
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Product data is unavailable');
  return data.filter(p => p.is_active === true).map(product => {
    if (!isProductId(product.id) || !['sku', 'name', 'description'].every(field => typeof product[field] === 'string')) {
      throw new Error('Product data is invalid');
    }
    return { ...product, cents: priceCents(product.unit_price) };
  });
}
