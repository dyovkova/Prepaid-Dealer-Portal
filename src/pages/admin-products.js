import { initPage } from '../utils/init-page.js';
import { loadAdminProducts, saveProduct, setProductActive } from '../services/admin-products.js';
import { filterProducts, productError } from '../admin-products/model.js';
import { productCard, confirmStatus } from '../admin-products/view.js';
import { createEditor } from '../admin-products/editor.js';
import { feedback } from '../draft/ui.js';

const grid = document.querySelector('#admin-product-grid'), search = document.querySelector('#admin-product-search');
const status = document.querySelector('#product-filter'), state = document.querySelector('#products-state');
const notice = document.querySelector('#products-feedback'), add = document.querySelector('#new-product');
const reload = document.querySelector('#reload-products');
let account, owner, request, products = [], busy = false, loading = false, loaded = false;
const editor = createEditor((values, id) => { void write(() => saveProduct(account, values, id), id ? 'Product saved.' : 'Product created.', true); });
function controls() {
  const blocked = !account || busy || loading;
  add.disabled = blocked || !loaded; reload.disabled = blocked;
  search.disabled = status.disabled = blocked || !loaded;
  grid.querySelectorAll('button').forEach(button => { button.disabled = blocked || !loaded; });
  editor.busy(blocked || !loaded);
}
function render() {
  const shown = filterProducts(products, search.value, status.value);
  grid.replaceChildren(...shown.map(productCard)); controls();
  document.querySelector('#admin-product-count').textContent = loaded ? `${shown.length} of ${products.length} products` : '';
  if (loaded) feedback(state, shown.length ? '' : products.length ? 'No products match your search and filter.' : 'No products yet. Create the first demo product.');
}
async function load() {
  request?.abort(); if (!account) return;
  const current = request = new AbortController(), actor = account;
  products = []; loaded = false; loading = true; render();
  feedback(state, 'Loading all products…'); grid.setAttribute('aria-busy', 'true');
  try {
    const rows = await loadAdminProducts(actor, current.signal);
    if (current.signal.aborted) return;
    products = rows; loaded = true; render();
  } catch (error) { if (!current.signal.aborted) feedback(state, productError(error), 'danger'); }
  finally { if (!current.signal.aborted) { loading = false; controls(); grid.setAttribute('aria-busy', 'false'); } }
}
async function write(operation, message, editing = false) {
  if (!account || busy || !loaded) return;
  const actor = account.userId; busy = true; request?.abort(); loading = false; controls();
  feedback(notice, 'Saving product…');
  try {
    const saved = await operation();
    if (account?.userId !== actor) return;
    products = [...products.filter(p => p.id !== saved.id), saved].sort((a,b) => a.sku.localeCompare(b.sku));
    if (editing) editor.close();
    feedback(notice, message, 'success'); render();
  } catch (error) {
    if (account?.userId !== actor) return;
    feedback(notice, productError(error, true), 'danger');
    if (editing) editor.failure(error);
    if (!error.code || error.code === 'product_unavailable') loaded = false;
  } finally { busy = false; controls(); }
}
grid.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || busy || !account) return;
  const product = products.find(p => p.id === button.closest('[data-product-id]').dataset.productId);
  if (!product) return;
  if (button.dataset.action === 'edit') { editor.open(product); return; }
  const actor = account.userId;
  if (await confirmStatus(product) && account?.userId === actor) {
    void write(() => setProductActive(account, product.id, !product.is_active), product.is_active ? 'Product archived. Saved orders are unchanged.' : 'Product reactivated.');
  }
});
search.addEventListener('input', render); status.addEventListener('change', render);
reload.addEventListener('click', () => { void load(); });
add.addEventListener('click', () => editor.open());
void initPage('admin-products', next => {
  request?.abort(); account = next; loaded = false; loading = false; products = []; render();
  const dialog = document.querySelector('#product-confirm'); if (dialog.open) dialog.close('cancel');
  if (!next) { feedback(notice, ''); feedback(state, 'Checking administrator access…'); return; }
  if (owner !== next.userId) { owner = next.userId; editor.close(); search.value = ''; status.value = 'all'; }
  void load();
});
