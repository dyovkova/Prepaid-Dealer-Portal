import { readOrderRequest, blocksDraft, requestKey } from './request.js';
import { processOrder, submissionError } from './submit.js';
import { feedback } from '../draft/ui.js';

export function initOrderSubmission(context, reload) {
  const form = document.querySelector('#order-submit-form');
  const note = document.querySelector('#order-note');
  const button = document.querySelector('#submit-order');
  const status = document.querySelector('#order-feedback');
  const reference = document.querySelector('#request-reference');
  const busy = new Set();
  let lastOwner, lastReceipt, outcome;
  function refresh() {
    const ctx = context(), owner = ctx.account?.userId;
    const eligible = Boolean(owner && ctx.account.role === 'dealer' && ctx.account.status === 'active');
    button.disabled = true; note.disabled = true; reference.textContent = '';
    if (!eligible) { feedback(status, ''); return; }
    if (owner !== lastOwner) { note.value = ''; lastOwner = owner; lastReceipt = null; }
    try {
      const record = readOrderRequest(owner), locked = blocksDraft(record), sending = busy.has(owner);
      if (outcome?.owner === owner && outcome.type === 'success' && ctx.items.length && record?.draftResolved) outcome = null;
      if (locked) note.value = record.payload.p_note ?? '';
      if (record?.draftResolved && lastReceipt !== record.payload.p_request_id) { note.value = ''; lastReceipt = record.payload.p_request_id; }
      note.disabled = locked || sending || !ctx.items.length;
      const ready = ctx.items.length && ctx.products && !ctx.invalid
        && ctx.items.every(item => ctx.products.has(item.productId)) && note.value.length <= 2000;
      button.disabled = sending || !navigator.locks || (!locked && !ready);
      button.textContent = sending ? 'Submitting…' : record?.status === 'confirmed' && !record.draftResolved
        ? 'Finish confirmation' : locked ? 'Retry saved request' : 'Submit order';
      form.setAttribute('aria-busy', String(sending));
      for (const row of document.querySelectorAll('#draft-items [data-product-id]')) {
        row.querySelector('input').disabled = locked || sending || !ctx.products?.has(row.dataset.productId);
        row.querySelector('[data-remove]').disabled = locked || sending;
      }
      document.querySelector('#clear-draft').disabled = locked || sending || !ctx.canClear;
      if (record) reference.textContent = `Request reference: ${record.payload.p_request_id}`;
      const message = outcome?.owner === owner ? outcome : null;
      if (sending) feedback(status, 'Submitting your saved request. Keep this page open; repeated clicks are blocked.');
      else if (message) feedback(status, message.text, message.type);
      else if (record?.status === 'confirmed' && (!record.draftResolved || !ctx.items.length)) feedback(status, `Order confirmed. Order UUID: ${record.orderId}${record.draftResolved ? '' : '. Finish confirmation to complete draft cleanup.'}`, 'success');
      else if (locked) feedback(status, 'This request is awaiting confirmation. Your draft is unchanged. Retry the saved request to recover its outcome.', 'warning');
      else if (!navigator.locks) feedback(status, 'Order submission needs a current browser on HTTPS or localhost.', 'warning');
      else feedback(status, '');
    } catch (error) { feedback(status, submissionError(error), 'danger'); }
  }
  note.addEventListener('input', () => { if (outcome?.owner === context().account?.userId) outcome = null; refresh(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const ctx = context(), owner = ctx.account?.userId;
    if (!owner || ctx.account.role !== 'dealer' || ctx.account.status !== 'active' || busy.has(owner)) return;
    try {
      const existing = readOrderRequest(owner);
      if (!blocksDraft(existing) && (!ctx.items.length || !ctx.products || ctx.invalid
        || !ctx.items.every(item => ctx.products.has(item.productId)) || note.value.length > 2000)) {
        throw Object.assign(new Error('Review valid quantities, current products and the optional note before submitting.'), { code: 'order_local' });
      }
      const selection = { items: structuredClone(ctx.items), note: note.value };
      busy.add(owner); outcome = null; refresh();
      const result = await processOrder(owner, selection);
      outcome = { owner, text: `Order submitted successfully. Order UUID: ${result.record.orderId}${result.draftKept ? '. Your changed draft was kept; review it before starting another order.' : ''}`, type: result.draftKept ? 'warning' : 'success' };
      if (context().account?.userId === owner) await reload();
    } catch (error) {
      outcome = { owner, text: submissionError(error), type: 'danger' };
      if (error.code === '22023' && context().account?.userId === owner) await reload();
    } finally {
      busy.delete(owner); refresh();
      if (context().account?.userId === owner && !status.hidden) status.focus({ preventScroll: true });
    }
  });
  window.addEventListener('pdp:order-request-updated', refresh);
  window.addEventListener('storage', event => {
    const owner = context().account?.userId;
    if (owner && (event.key === null || event.key === requestKey(owner))) refresh();
  });
  return { refresh };
}
