import { initPage } from '../utils/init-page.js';
import { loadProducts } from '../services/products.js';
import { euros, estimate, quantity } from '../draft/model.js';
import { readDraft, writeDraft, clearDraft, draftKey } from '../draft/storage.js';
import { draftItem, feedback, validateQuantity } from '../draft/ui.js';

const list = document.querySelector('#draft-items');
const state = document.querySelector('#draft-state');
const notice = document.querySelector('#draft-feedback');
const retry = document.querySelector('#retry-draft');
const clear = document.querySelector('#clear-draft');
let account, request, items = [], products = null, saveError = false;

function summary() {
  document.querySelector('#draft-product-count').textContent = items.length;
  document.querySelector('#draft-unit-count').textContent = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = document.querySelector('#draft-total');
  const invalid = Boolean(list.querySelector('[aria-invalid="true"]'));
  if (saveError || invalid || (items.length && !products)) { total.textContent = 'Unavailable'; return; }
  try {
    const result = estimate(items, products ?? new Map());
    total.textContent = euros(result.cents);
    document.querySelector('#estimate-note').textContent = result.unavailable
      ? `${result.unavailable} unavailable product(s) excluded. Remove them from the draft. This total estimates available items only.`
      : 'Estimate only, using products and prices checked on this page load. Final order prices must be validated by the server.';
  } catch (error) { total.textContent = 'Unavailable'; feedback(notice, error.message, 'warning'); }
}
function render(loading = false) {
  list.replaceChildren(...items.map(item => draftItem(item, products?.get(item.productId), loading)));
  document.querySelector('#empty-draft').hidden = Boolean(items.length);
  clear.disabled = !items.length;
  summary();
}
async function activate(next) {
  request?.abort(); account = next; items = []; products = null; saveError = false;
  list.replaceChildren(); list.setAttribute('aria-busy', 'true');
  retry.hidden = true; clear.disabled = true; document.querySelector('#empty-draft').hidden = true;
  feedback(notice, ''); feedback(state, 'Checking your draft…'); summary();
  if (!account) return;
  const current = request = new AbortController();
  try { items = readDraft(account.userId); render(true); }
  catch (error) {
    feedback(state, error.message, 'warning'); clear.disabled = false;
    document.querySelector('#draft-total').textContent = 'Unavailable';
    list.setAttribute('aria-busy', 'false'); return;
  }
  if (!items.length) { products = new Map(); render(); feedback(state, ''); list.setAttribute('aria-busy', 'false'); return; }
  try {
    const found = await loadProducts({ ids: items.map(item => item.productId), signal: current.signal });
    if (current.signal.aborted) return;
    products = new Map(found.map(product => [product.id, product])); render();
    feedback(state, found.length < items.length ? 'Some draft products are no longer available. They cannot be ordered and are excluded from the estimate.' : '', 'warning');
  } catch {
    if (!current.signal.aborted) {
      products = null; render();
      feedback(state, 'Could not check current products and prices. Your draft is still saved. Retry before relying on an estimate.', 'danger'); retry.hidden = false;
    }
  } finally { if (!current.signal.aborted) list.setAttribute('aria-busy', 'false'); }
}
list.addEventListener('input', event => {
  const input = event.target;
  if (!account || !input.matches('input') || !products) return;
  const row = input.closest('[data-product-id]');
  if (!validateQuantity(input)) { row.querySelector('.line-total').textContent = 'Enter a valid quantity'; summary(); return; }
  try {
    const latest = readDraft(account.userId);
    const item = latest.find(item => item.productId === row.dataset.productId);
    if (!item) throw new Error('Your draft changed in another tab. Refresh to check it again.');
    item.quantity = quantity(input.value);
    writeDraft(account.userId, latest); items = latest; saveError = false;
    row.querySelector('.line-total').textContent = euros(products.get(item.productId).cents * item.quantity);
    feedback(notice, 'Quantity saved to your local draft.', 'success'); summary();
  } catch (error) { saveError = true; feedback(notice, error.message, 'danger'); summary(); }
});
list.addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (!button || !account) return;
  try {
    const id = button.closest('[data-product-id]').dataset.productId;
    const remaining = readDraft(account.userId).filter(item => item.productId !== id);
    writeDraft(account.userId, remaining); items = remaining; saveError = false; render();
    feedback(notice, 'Product removed from your local draft.', 'success');
    if (!items.length || (products && items.every(item => products.has(item.productId)))) feedback(state, '');
  } catch (error) { feedback(notice, error.message, 'danger'); }
});
clear.addEventListener('click', () => {
  if (!account) return;
  try {
    clearDraft(account.userId); request?.abort(); list.setAttribute('aria-busy', 'false'); retry.hidden = true;
    items = []; products = new Map(); saveError = false;
    render(); feedback(state, ''); feedback(notice, 'Draft cleared. No order was submitted.', 'success');
  } catch (error) { feedback(notice, error.message, 'danger'); }
});
retry.addEventListener('click', () => { void activate(account); });
window.addEventListener('storage', event => {
  if (account && (event.key === null || event.key === draftKey(account.userId))) void activate(account);
});
void initPage('new-order', next => { void activate(next); });
