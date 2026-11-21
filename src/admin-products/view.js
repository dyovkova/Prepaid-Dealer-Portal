import { euros } from '../draft/model.js';

export function productCard(product) {
  const column = document.createElement('div');
  column.className = 'col-md-6 col-xl-4'; column.dataset.productId = product.id;
  column.innerHTML = `<article class="card h-100"><div class="card-body d-flex flex-column">
    <div class="d-flex justify-content-between align-items-start gap-2 mb-3"><span class="product-type">Prepaid demo</span><span data-status class="badge"></span></div>
    <h3 class="h5 product-description"></h3><p class="form-note product-sku"></p>
    <p data-description class="text-secondary product-description flex-grow-1"></p>
    <p data-price class="fs-5 fw-semibold"></p>
    <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-outline-primary" data-action="edit">Edit</button>
    <button type="button" class="btn btn-outline-secondary" data-action="status"></button></div>
  </div></article>`;
  column.querySelector('h3').textContent = product.name;
  column.querySelector('.product-sku').textContent = `SKU: ${product.sku}`;
  column.querySelector('[data-description]').textContent = product.description || 'No description.';
  column.querySelector('[data-price]').textContent = `${euros(product.cents)} / unit`;
  const badge = column.querySelector('[data-status]');
  badge.textContent = product.is_active ? 'Active' : 'Inactive';
  badge.classList.add(product.is_active ? 'text-bg-success' : 'text-bg-secondary');
  const status = column.querySelector('[data-action="status"]');
  status.textContent = product.is_active ? 'Archive' : 'Reactivate';
  status.setAttribute('aria-label', `${status.textContent} ${product.sku}`);
  column.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit ${product.sku}`);
  return column;
}
export function confirmStatus(product) {
  const dialog = document.querySelector('#product-confirm');
  const action = product.is_active ? 'Archive' : 'Reactivate';
  dialog.querySelector('h2').textContent = `${action} product?`;
  dialog.querySelector('p').textContent = product.is_active
    ? `Archive ${product.sku}? Dealers will no longer see it. Saved orders keep their original snapshots.`
    : `Reactivate ${product.sku}? It will be available in the dealer catalog.`;
  dialog.querySelector('[value="confirm"]').textContent = action;
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
