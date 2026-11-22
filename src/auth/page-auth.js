import { loadAccount, signOut } from '../services/auth.js';
import { getSupabase } from '../services/supabase.js';
import { renderHeader } from '../components/header.js';
import { accountMessages, authError } from './messages.js';
import { updateDraftCounter } from '../draft/counter.js';
import { discardDraft } from '../draft/storage.js';

const allowedRoles = { catalog: ['dealer'], 'new-order': ['dealer'], 'my-orders': ['dealer'],
  'order-details': ['dealer'], admin: ['admin'], 'admin-products': ['admin'], 'admin-dealers': ['admin'] };
const destination = role => role === 'admin' ? '/admin/' : '/catalog/';

export async function startPageAuth(page, onAccount = () => {}) {
  const content = document.querySelector('#protected-content');
  const form = document.querySelector('[data-auth-form]');
  const status = document.createElement('section');
  status.id = 'account-status';
  status.className = 'mb-4';
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('role', 'status');
  document.querySelector('main').prepend(status);
  let generation = 0;
  let checking = false;
  let loggingOut = false;
  let lastDealerId = null;

  function suspend() {
    onAccount(null);
    updateDraftCounter(null);
  }

  function message(text, type = 'info', retry = false) {
    status.replaceChildren();
    status.className = `alert alert-${type} mb-4`;
    const paragraph = document.createElement('p');
    paragraph.className = 'mb-0';
    paragraph.textContent = text;
    status.append(paragraph);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-outline-primary btn-sm mt-3';
      button.textContent = 'Check account again'; button.addEventListener('click', () => refresh());
      status.append(button);
    }
    status.hidden = false;
  }

  async function refresh() {
    if (loggingOut) return;
    const current = ++generation;
    checking = true;
    if (content) content.hidden = true;
    suspend();
    message('Checking your session and account…');
    try {
      const account = await loadAccount();
      if (current !== generation) return;
      lastDealerId = account?.role === 'dealer' ? account.userId : null;
      document.querySelector('#site-header').innerHTML = renderHeader(page, account);
      const name = document.querySelector('[data-account-name]');
      if (name) name.textContent = account.profile?.display_name ?? 'Account';
      if (allowedRoles[page] && !account) {
        location.replace('/login/?notice=sign-in-required'); return;
      }
      if (account && account.status !== 'active') {
        message(accountMessages[account.status], 'warning', true);
        if (form) form.hidden = true;
        return;
      }
      if (account && ((page === 'login' || page === 'register') ||
        (allowedRoles[page] && !allowedRoles[page].includes(account.role)))) {
        const reason = allowedRoles[page] ? '?notice=role-restricted' : '';
        location.replace(destination(account.role) + reason); return;
      }
      if (content) content.hidden = false;
      updateDraftCounter(account);
      onAccount(account);
      if (form) { form.hidden = false; form.querySelector('fieldset').disabled = false; }
      const notice = new URLSearchParams(location.search).get('notice');
      if (account && content) message(notice === 'role-restricted'
        ? 'That page is restricted to a different role. Your workspace is shown below.'
        : `Signed in as ${account.profile.display_name}.`, notice === 'role-restricted' ? 'warning' : 'success');
      else if (notice === 'signed-out') message('You have been logged out.', 'success');
      else if (notice === 'sign-in-required') message('Please log in to access your workspace.');
      else status.hidden = true;
    } catch (error) {
      if (current !== generation) return;
      message(authError(error), 'danger', true);
      // A rejected stored session must not prevent a fresh explicit login.
      if (form && error.code === 'portal_session') {
        form.hidden = false; form.querySelector('fieldset').disabled = false;
      }
    } finally {
      if (current === generation) checking = false;
    }
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-logout]');
    if (!button || loggingOut) return;
    loggingOut = true;
    generation += 1;
    if (content) content.hidden = true;
    suspend();
    button.disabled = true;
    message('Logging out…');
    try { await signOut(); discardDraft(lastDealerId); location.replace('/login/?notice=signed-out'); }
    catch (error) {
      loggingOut = false;
      message(authError(error), 'danger', true); button.disabled = false;
    }
  });
  try {
    getSupabase().auth.onAuthStateChange(event => {
      if (event !== 'INITIAL_SESSION') setTimeout(() => {
        // Broadcast events can be stale: reread the SDK session instead of
        // deleting a draft or treating the event payload as current identity.
        // Local forms explicitly refresh after completion; cross-tab events still recheck.
        if (!loggingOut && !form?.matches('[aria-busy="true"]')) void refresh();
      }, 0);
    });
  } catch { /* refresh displays a configuration error. */ }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !checking && !loggingOut) void refresh();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) void refresh(); });
  await refresh();
  return { refresh };
}
