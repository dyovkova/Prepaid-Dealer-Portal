import { isProductId, priceCents } from '../draft/model.js';

const invalid = (field, message) => Object.assign(new Error(message), { code: 'product_validation', field });
export function productValues(values) {
  const sku = typeof values.sku === 'string' ? values.sku.trim() : '';
  const name = typeof values.name === 'string' ? values.name.trim() : '';
  if (!sku) throw invalid('sku', 'Enter a nonblank SKU. SKUs are case-sensitive and must be unique.');
  if (!name) throw invalid('name', 'Enter a product name.');
  let cents;
  try { cents = priceCents(String(values.unit_price).trim()); } catch { /* Report the field below. */ }
  if (cents === undefined || cents > 999999999999) {
    throw invalid('unit_price', 'Enter a EUR price from 0 to 9999999999.99 with at most two decimal places.');
  }
  return { sku, name, description: typeof values.description === 'string' ? values.description.trim() : '',
    unit_price: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` };
}
export function adminProduct(row) {
  if (!row || !isProductId(row.id) || typeof row.is_active !== 'boolean'
    || !['sku', 'name', 'description'].every(key => typeof row[key] === 'string')) throw new Error('Invalid product data');
  const values = productValues(row);
  return { id: row.id, sku: row.sku, name: row.name, description: row.description,
    unit_price: values.unit_price, is_active: row.is_active, cents: priceCents(values.unit_price) };
}
export function filterProducts(products, term, status) {
  const search = term.trim().toLowerCase();
  return products.filter(p => (status === 'all' || (status === 'active' ? p.is_active : !p.is_active))
    && `${p.sku} ${p.name} ${p.description}`.toLowerCase().includes(search));
}
export function productError(error, writing = false) {
  if (error.code === 'product_validation') return error.message;
  if (error.code === '23505') return 'That SKU is already in use. Choose a unique SKU.';
  if (['23502', '23514', '22003', '22P02'].includes(error.code)) return 'Check the required fields and enter a valid EUR price.';
  if (['42501', 'portal_session', 'admin_required'].includes(error.code) || [401, 403].includes(error.status)) return 'Administrator access is unavailable. Check your session and reload products.';
  if (error.code === 'product_unavailable') return 'The product is unavailable or your access changed. Reload products before retrying.';
  return writing ? 'Could not confirm the change. Reload products before retrying; it may already be saved.'
    : 'Could not load products. Check your connection and retry.';
}
