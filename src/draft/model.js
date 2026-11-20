export const MAX_QUANTITY = 999;
export const MAX_DRAFT_ITEMS = 100;
export const isProductId = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function quantity(value) {
  const text = String(value).trim();
  const result = /^\d+$/.test(text) ? Number(text) : NaN;
  return Number.isSafeInteger(result) && result >= 1 && result <= MAX_QUANTITY ? result : null;
}

export function validateItems(items) {
  if (!Array.isArray(items) || items.length > MAX_DRAFT_ITEMS) throw new Error('Invalid draft');
  const ids = new Set();
  return items.map(item => {
    if (!item || !isProductId(item.productId) || typeof item.quantity !== 'number'
      || quantity(item.quantity) === null || ids.has(item.productId.toLowerCase())) throw new Error('Invalid draft');
    ids.add(item.productId.toLowerCase());
    // Never retain locally supplied names, prices, status or totals.
    return { productId: item.productId.toLowerCase(), quantity: item.quantity };
  });
}

export function priceCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid product price');
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid product price');
  return result;
}

export function estimate(items, products) {
  let cents = 0;
  let unavailable = 0;
  for (const item of validateItems(items)) {
    const product = products.get(item.productId);
    if (!product) { unavailable++; continue; }
    const line = product.cents * item.quantity;
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(cents + line)) {
      throw new Error('Estimate is too large. Reduce quantities.');
    }
    cents += line;
  }
  return { cents, unavailable, units: items.reduce((sum, item) => sum + item.quantity, 0) };
}

export const euros = cents => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
