import { productValues, productError } from './model.js';
import { feedback } from '../draft/ui.js';

export function createEditor(onSave) {
  const section = document.querySelector('#product-editor'), form = section.querySelector('form');
  const fields = form.querySelector('fieldset'), notice = section.querySelector('[role="status"]');
  let id = null;
  const close = () => { section.hidden = true; form.reset(); id = null; feedback(notice, ''); };
  function failure(error) {
    feedback(notice, productError(error, true), 'danger');
    const input = form.elements.namedItem(error.field ?? (error.code === '23505' ? 'sku' : ''));
    if (input) { input.setCustomValidity(productError(error, true)); input.setAttribute('aria-invalid', 'true'); input.reportValidity(); }
  }
  form.addEventListener('input', event => { event.target.setCustomValidity?.(''); event.target.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (fields.disabled) return;
    try { onSave(productValues(Object.fromEntries(new FormData(form))), id); }
    catch (error) { failure(error); }
  });
  section.querySelector('[data-cancel]').addEventListener('click', close);
  return { close, failure,
    busy(value) { fields.disabled = value; form.setAttribute('aria-busy', String(value)); },
    open(product = null) {
      close(); id = product?.id ?? null;
      section.querySelector('h2').textContent = product ? 'Edit product' : 'Create product';
      for (const key of ['sku', 'name', 'description', 'unit_price']) form.elements.namedItem(key).value = product?.[key] ?? '';
      for (const input of form.querySelectorAll('input,textarea')) { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); }
      section.hidden = false; section.scrollIntoView({ block: 'start', behavior: 'instant' });
      form.elements.namedItem('sku').focus();
    },
  };
}
