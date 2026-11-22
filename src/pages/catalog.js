import { initPage } from '../utils/init-page.js';
import { loadProducts } from '../services/products.js';
import { quantity, MAX_QUANTITY, MAX_DRAFT_ITEMS } from '../draft/model.js';
import { readDraft, writeDraft, clearDraft, draftKey } from '../draft/storage.js';
import { feedback, productCard, validateQuantity } from '../draft/ui.js';
import { assertDraftEditable, requestKey } from '../orders/request.js';
import { catalogFeedback, syncDraftIndicators } from '../draft/catalog-feedback.js';

const grid = document.querySelector('#product-grid');
const search = document.querySelector('#product-search');
const state = document.querySelector('#catalog-state');
const notice = document.querySelector('#catalog-feedback');
const retry = document.querySelector('#retry-products');
const reset = document.querySelector('#reset-draft');
const draftFeedback = catalogFeedback(document.querySelector('#catalog-draft-feedback'));
let account, request, ownerId, storageNotice = false, products = [];

function checkStorage() {
  let error = '';
  let resettable = false;
  let items = [];
  try { assertDraftEditable(account.userId); } catch (cause) { error = cause.message; }
  try { items = readDraft(account.userId); }
  catch (cause) { if (!error) { resettable = true; error = cause.message; } }
  syncDraftIndicators(grid, items);
  reset.hidden = !resettable;
  grid.querySelectorAll('button').forEach(button => { button.disabled = Boolean(error); });
  if (error) { draftFeedback.clear(); feedback(notice, error, 'warning'); storageNotice = true; }
  else if (storageNotice) { feedback(notice, ''); storageNotice = false; }
}
function filter() {
  const term = search.value.trim().toLowerCase();
  let visible = 0;
  for (const product of products) {
    const card = grid.querySelector(`[data-product-id="${product.id}"]`);
    card.hidden = !`${product.name} ${product.sku} ${product.description}`.toLowerCase().includes(term);
    if (!card.hidden) visible++;
  }
  document.querySelector('#product-count').textContent = `${visible} of ${products.length} products`;
  feedback(state, visible ? '' : products.length ? 'No products match your search.' : 'No active products are available right now.');
}
async function activate(next) {
  request?.abort();
  draftFeedback.clear();
  if (next && ownerId !== next.userId) { search.value = ''; ownerId = next.userId; }
  account = next; products = []; grid.replaceChildren();
  search.disabled = true; retry.hidden = true; reset.hidden = true;
  document.querySelector('#product-count').textContent = '';
  feedback(notice, ''); feedback(state, 'Loading products…'); grid.setAttribute('aria-busy', 'true');
  if (!account) return;
  const current = request = new AbortController();
  try {
    const found = await loadProducts({ signal: current.signal });
    if (current.signal.aborted) return;
    products = found; grid.replaceChildren(...products.map(productCard));
    search.disabled = false; filter(); checkStorage();
  } catch {
    if (!current.signal.aborted) {
      products = []; grid.replaceChildren();
      feedback(state, 'Could not load products. Check your connection and retry.', 'danger'); retry.hidden = false;
    }
  } finally { if (!current.signal.aborted) grid.setAttribute('aria-busy', 'false'); }
}
grid.addEventListener('input', event => { if (event.target.matches('input')) validateQuantity(event.target); });
grid.addEventListener('submit', event => {
  event.preventDefault();
  if (!account) return;
  draftFeedback.clear();
  const card = event.target.closest('[data-product-id]');
  const input = card.querySelector('input');
  if (!validateQuantity(input)) { input.reportValidity(); return; }
  try {
    const items = readDraft(account.userId);
    const item = items.find(item => item.productId === card.dataset.productId);
    const amount = quantity(input.value);
    const total = (item?.quantity ?? 0) + amount;
    if (item && item.quantity + amount > MAX_QUANTITY) throw new Error(`A product can have at most ${MAX_QUANTITY} units in the draft. Edit its quantity in New order.`);
    if (!item && items.length >= MAX_DRAFT_ITEMS) throw new Error(`A draft can contain at most ${MAX_DRAFT_ITEMS} different products.`);
    if (item) item.quantity += amount; else items.push({ productId: card.dataset.productId, quantity: amount });
    writeDraft(account.userId, items);
    if (readDraft(account.userId).find(saved => saved.productId === card.dataset.productId)?.quantity !== total) {
      throw new Error('The draft changed before confirmation. Open View draft to check your selection.');
    }
    const product = products.find(p => p.id === card.dataset.productId);
    draftFeedback.success(product, amount, total, Boolean(item), card.querySelector('button'));
  } catch (error) { draftFeedback.error(error.message, card.querySelector('button')); }
});
search.addEventListener('input', filter);
retry.addEventListener('click', () => { void activate(account); });
reset.addEventListener('click', () => {
  if (!account) return;
  try { clearDraft(account.userId); checkStorage(); feedback(notice, 'Unreadable draft cleared.', 'success'); }
  catch (error) { feedback(notice, error.message, 'danger'); }
});
window.addEventListener('storage', event => {
  if (account && (event.key === null || [draftKey(account.userId), requestKey(account.userId)].includes(event.key))) {
    draftFeedback.clear(true); checkStorage();
  }
});
window.addEventListener('pdp:draft-updated', () => { if (account) { draftFeedback.clear(true); checkStorage(); } });
window.addEventListener('pdp:order-request-updated', () => { if (account) checkStorage(); });
void initPage('catalog', next => { void activate(next); });
