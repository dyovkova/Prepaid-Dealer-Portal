import { organizationValues, dealerError } from './model.js';
import { feedback } from '../draft/ui.js';

export function createOrganizationEditor(onSave) {
  const section = document.querySelector('#organization-editor'), form = section.querySelector('form');
  const input = form.elements.namedItem('name'), fieldset = form.querySelector('fieldset'), notice = section.querySelector('[role="status"]');
  let id = null;
  const close = () => { section.hidden = true; form.reset(); id = null; feedback(notice, ''); input.setCustomValidity(''); input.removeAttribute('aria-invalid'); };
  const failure = error => {
    feedback(notice, dealerError(error, true), 'danger');
    if (error.code === 'dealer_validation') { input.setCustomValidity(error.message); input.setAttribute('aria-invalid', 'true'); input.reportValidity(); }
  };
  input.addEventListener('input', () => { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (fieldset.disabled) return;
    try { onSave(organizationValues({ name: input.value }), id); } catch (error) { failure(error); }
  });
  section.querySelector('[data-cancel]').addEventListener('click', close);
  return { close, failure,
    busy(value) { fieldset.disabled = value; form.setAttribute('aria-busy', String(value)); },
    open(group = null) {
      close(); id = group?.id ?? null; input.value = group?.name ?? '';
      section.querySelector('h2').textContent = group ? 'Rename organization' : 'Create organization';
      section.hidden = false; section.scrollIntoView({ block: 'start', behavior: 'instant' }); input.focus();
    },
  };
}
