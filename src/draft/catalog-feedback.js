export function syncDraftIndicators(grid, items) {
  const quantities = new Map(items.map(item => [item.productId, item.quantity]));
  for (const card of grid.querySelectorAll('[data-product-id]')) {
    const indicator = card.querySelector('[data-draft-indicator]');
    const quantity = quantities.get(card.dataset.productId);
    indicator.hidden = quantity === undefined;
    indicator.replaceChildren();
    if (quantity !== undefined) {
      const count = document.createElement('span'); count.className = 'visually-hidden';
      count.textContent = ` · ${quantity} ${quantity === 1 ? 'unit' : 'units'}`;
      indicator.append('Added to draft', count);
    }
  }
}

export function catalogFeedback(root) {
  const toast = root.querySelector('[data-draft-toast]');
  const title = root.querySelector('[data-toast-title]');
  const detail = root.querySelector('[data-toast-detail]');
  const announcement = root.querySelector('[data-draft-announcement]');
  let source;
  function clear(restoreFocus = false) {
    const focused = toast.contains(document.activeElement);
    toast.hidden = true; announcement.textContent = '';
    if (restoreFocus && focused) {
      const target = source?.isConnected && !source.disabled && source.getClientRects().length
        ? source : document.querySelector('#product-search');
      target?.focus();
    }
    source = null;
  }
  function show(heading, text, kind, button) {
    source = button; title.textContent = heading; detail.textContent = text;
    toast.dataset.kind = kind; toast.hidden = false;
    announcement.textContent = `${heading}. ${text}`;
  }
  root.querySelector('[data-dismiss-draft-toast]').addEventListener('click', () => clear(true));
  return {
    clear,
    success(product, amount, total, existing, button) {
      const units = `${total} ${total === 1 ? 'unit' : 'units'} in draft`;
      show('Product added to draft', existing
        ? `Quantity updated for ${product.name}: ${units} (+${amount}).`
        : `${product.name}: ${units}.`, 'success', button);
    },
    error(message, button) { show('Draft update not confirmed', message, 'error', button); },
  };
}
