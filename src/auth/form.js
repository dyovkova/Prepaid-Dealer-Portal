import { initPage } from '../utils/init-page.js';
import { signIn, register } from '../services/auth.js';
import { validateAuthForm } from './validation.js';
import { authError } from './messages.js';

export async function initAuthForm(mode) {
  const form = document.querySelector('[data-auth-form]');
  const feedback = document.querySelector('#form-feedback');
  const fieldset = form.querySelector('fieldset');
  const button = form.querySelector('[type="submit"]');
  const label = button.textContent;
  const page = await initPage(mode);
  const show = (text, type) => {
    feedback.className = `alert alert-${type}`;
    feedback.textContent = text;
    feedback.hidden = false;
  };
  form.addEventListener('input', event => event.target.setCustomValidity?.(''));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    if (!validateAuthForm(form)) { show('Please check the highlighted fields.', 'danger'); return; }
    form.setAttribute('aria-busy', 'true'); fieldset.disabled = true;
    page.beginAuth();
    button.textContent = mode === 'register' ? 'Creating account…' : 'Logging in…';
    show(mode === 'register' ? 'Creating your dealer account…' : 'Checking your credentials…', 'info');
    const value = name => form.elements.namedItem(name).value;
    let navigating = false;
    try {
      const data = mode === 'register'
        ? await register({ email: value('email').trim(), password: value('password'),
          displayName: value('contact-name').trim(), businessName: value('business-name').trim() })
        : await signIn(value('email').trim(), value('password'));
      form.classList.remove('was-validated');
      form.elements.namedItem('password').value = '';
      if (form.elements.namedItem('password-confirm')) form.elements.namedItem('password-confirm').value = '';
      if (!data.session) {
        show('Registration received. Confirm your email before logging in.', 'success');
      } else {
        show(mode === 'register' ? 'Account created. Opening your workspace…' : 'Login successful. Opening your workspace…', 'info');
        navigating = await page.refresh() === true;
      }
    } catch (error) {
      show(authError(error), 'danger');
      form.elements.namedItem('password').value = '';
    } finally {
      if (!navigating) {
        form.removeAttribute('aria-busy'); fieldset.disabled = false; button.textContent = label;
      }
    }
  });
}
