import { readDraft, clearConfirmedDraft } from '../draft/storage.js';
import { submitOrder } from '../services/orders.js';
import { requestKey, readOrderRequest, writeOrderRequest, removeOrderRequest, makePayload, orderItems, localError } from './request.js';

function finishConfirmation(ownerId, record) {
  const kept = readDraft(ownerId).length > 0 && !clearConfirmedDraft(ownerId, record.payload.p_request_id);
  record = writeOrderRequest(ownerId, { ...record, draftResolved: true });
  return { record, draftKept: kept };
}
export function processOrder(ownerId, selection, send = submitOrder) {
  if (!navigator.locks) throw localError('This browser cannot safely coordinate order requests. Use a current browser on HTTPS or localhost.');
  return navigator.locks.request(requestKey(ownerId), async () => {
    let saved = readOrderRequest(ownerId);
    const current = readDraft(ownerId);
    if (saved?.status === 'confirmed' && (!saved.draftResolved || !current.length)) return finishConfirmation(ownerId, saved);
    if (!saved || saved.draftResolved) {
      if (JSON.stringify(orderItems(current)) !== JSON.stringify(orderItems(selection.items))) {
        throw localError('Your draft changed. Review it before submitting.');
      }
      const record = { version: 1, status: 'pending', payload: makePayload(current, selection.note), orderId: null, draftResolved: false };
      try { saved = writeOrderRequest(ownerId, record); }
      catch { throw localError('No order was sent because its request could not be saved. Check browser storage and try again.'); }
    }
    let confirmedId;
    try {
      confirmedId = await send(ownerId, structuredClone(saved.payload));
      saved = writeOrderRequest(ownerId, { ...saved, status: 'confirmed', orderId: confirmedId });
      return finishConfirmation(ownerId, saved);
    } catch (error) {
      // 22023 is a definitive transaction rejection. Authorization/conflict and
      // transport errors cannot establish whether an earlier attempt committed.
      if (error.code === '22023' && !confirmedId) removeOrderRequest(ownerId, saved.payload.p_request_id);
      if (confirmedId) error.confirmedOrderId = confirmedId;
      throw error;
    }
  });
}
export function submissionError(error) {
  if (error.confirmedOrderId) return `Order confirmed: ${error.confirmedOrderId}. Draft cleanup could not finish. Keep the saved request and finish confirmation before starting another order.`;
  if (error.code === '22023') return 'The server rejected a product, quantity or note. Your draft is unchanged. Check products and edit the draft before submitting again.';
  if (error.code === '42501') return 'Your account or organization cannot submit right now. Your draft and request are kept. Check your account status or sign in again, then retry.';
  if (error.code === '23505') return 'This request conflicts with an existing order. Your draft and request are kept. Ask the demo operator to review it before starting a replacement.';
  if (['order_local', 'order_session_changed'].includes(error.code)) return error.message;
  return 'The submission outcome could not be confirmed. Your draft and exact request are saved. Retry the saved request; do not start a replacement.';
}
