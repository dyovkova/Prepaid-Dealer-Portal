import { MAX_QUANTITY, euros, quantity } from './model.js';

export function feedback(element, text, type = 'info') {
  element.className = `alert alert-${type}`;
  element.textContent = text;
  element.hidden = !text;
}

export function validateQuantity(input) {
  const valid = quantity(input.value) !== null;
  input.setCustomValidity(valid ? '' : `Enter a whole quantity from 1 to ${MAX_QUANTITY}.`);
  input.setAttribute('aria-invalid', String(!valid));
  input.classList.toggle('is-invalid', !valid);
  input.closest('[data-product-id]')?.querySelector('.invalid-feedback')?.classList.toggle('d-block', !valid);
  return valid;
}

export function productCard(product) {
  const column = document.createElement('div');
  column.className = 'col-md-6 col-lg-4';
  column.dataset.productId = product.id;
  column.innerHTML = `<article class="card h-100"><div class="card-body d-flex flex-column">
    <div class="catalog-product-heading d-flex justify-content-between align-items-center gap-2 mb-3">
      <span class="product-type">Prepaid demo</span><p class="draft-indicator" data-draft-indicator hidden></p>
    </div><h3></h3>
    <p class="form-note product-sku"></p>
    <p class="text-secondary flex-grow-1 product-description"></p>
    <div class="product-footer"><p class="fs-5 fw-semibold product-price"></p>
      <form novalidate><label class="form-label">Quantity</label>
        <div class="d-flex gap-2 align-items-start"><input class="form-control quantity-input" type="number" min="1" max="999" step="1" value="1" required inputmode="numeric">
          <button class="btn btn-primary flex-grow-1" type="submit">Add to draft</button></div>
        <div class="invalid-feedback">Enter a whole quantity from 1 to 999.</div>
      </form>
    </div></div></article>`;
  column.querySelector('h3').textContent = product.name;
  column.querySelector('.product-sku').textContent = `SKU: ${product.sku}`;
  column.querySelector('.product-description').textContent = product.description;
  column.querySelector('.product-price').textContent = `${euros(product.cents)} / unit`;
  const input = column.querySelector('input');
  input.id = `quantity-${product.id}`;
  column.querySelector('label').htmlFor = input.id;
  column.querySelector('.invalid-feedback').id = `${input.id}-help`;
  input.setAttribute('aria-describedby', `${input.id}-help`);
  return column;
}

export function draftItem(item, product, loading = false) {
  const row = document.createElement('article');
  row.className = 'card mb-3 draft-item'; row.dataset.productId = item.productId;
  row.innerHTML = `<div class="card-body"><div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
      <div class="draft-product"><h3></h3><p class="form-note mb-0 product-sku"></p></div>
      <button class="btn btn-outline-danger btn-sm" type="button" data-remove>Remove</button></div>
    <p class="text-secondary product-description"></p>
    <div class="draft-item-values"><div><label class="form-label">Quantity</label>
      <input class="form-control quantity-input" type="number" min="1" max="999" step="1" required inputmode="numeric">
      <div class="invalid-feedback">Enter a whole quantity from 1 to 999.</div></div>
      <div><p class="form-note mb-1">Current unit price</p><p class="fw-semibold unit-price"></p></div>
      <div><p class="form-note mb-1">Estimated line total</p><p class="fw-semibold line-total"></p></div></div>
    <p class="form-note unavailable-note mb-0 mt-3" hidden></p></div>`;
  row.querySelector('h3').textContent = product?.name ?? (loading ? 'Checking product…' : 'Unavailable product');
  row.querySelector('.product-sku').textContent = product ? `SKU: ${product.sku}` : '';
  row.querySelector('.product-description').textContent = product?.description ?? '';
  row.querySelector('[data-remove]').setAttribute('aria-label', `Remove ${product?.name ?? 'unavailable product'}`);
  row.querySelector('.unit-price').textContent = product ? euros(product.cents) : 'Unavailable';
  row.querySelector('.line-total').textContent = product ? euros(product.cents * item.quantity) : 'Not included';
  const input = row.querySelector('input');
  input.id = `draft-quantity-${item.productId}`; input.value = item.quantity; input.disabled = !product;
  row.querySelector('label').htmlFor = input.id;
  row.querySelector('.invalid-feedback').id = `${input.id}-help`;
  input.setAttribute('aria-describedby', `${input.id}-help`);
  if (!product && !loading) {
    const note = row.querySelector('.unavailable-note'); note.hidden = false;
    note.textContent = 'This product could not be verified as active. It is excluded from estimates. Remove it from your draft.';
  }
  return row;
}
