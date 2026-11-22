import { initPage } from '../utils/init-page.js';
import { loadDealerDirectory, saveOrganization, setOrganizationActive, setDealerProfileActive } from '../services/admin-dealers.js';
import { filterOrganizations, filterProfiles, dealerError } from '../admin-dealers/model.js';
import { organizationCard, profileCard, confirmActivation } from '../admin-dealers/view.js';
import { createOrganizationEditor } from '../admin-dealers/editor.js';
import { feedback } from '../draft/ui.js';

const $ = selector => document.querySelector(selector);
const groups = $('#organization-grid'), users = $('#profile-grid'), state = $('#dealers-state'), notice = $('#dealers-feedback');
const search = $('#organization-search'), filter = $('#organization-filter'), userSearch = $('#profile-search'), userFilter = $('#profile-filter');
const add = $('#new-organization'), reload = $('#reload-dealers'), dialog = $('#dealer-confirm');
let account, request, generation = 0, busy = false, loading = false, loaded = false, directory = { organizations: [], users: [] };
const editor = createOrganizationEditor((values, id) => {
  void write(() => saveOrganization(account, values, id), id ? 'Organization renamed.' : 'Organization created. No user account was created.', true);
});
function controls() {
  const blocked = !account || busy || loading;
  reload.disabled = blocked;
  for (const input of [add, search, filter, userSearch, userFilter]) input.disabled = blocked || !loaded;
  for (const button of document.querySelectorAll('#organization-grid button, #profile-grid button')) button.disabled = blocked || !loaded;
  editor.busy(blocked || !loaded);
}
function render() {
  const shown = filterOrganizations(directory.organizations, search.value, filter.value);
  const profiles = filterProfiles(directory.users, userSearch.value, userFilter.value);
  groups.replaceChildren(...shown.map(organizationCard)); users.replaceChildren(...profiles.map(profileCard));
  $('#organization-count').textContent = loaded ? `${shown.length} of ${directory.organizations.length} organizations` : '';
  $('#profile-count').textContent = loaded ? `${profiles.length} of ${directory.users.length} profiles` : '';
  feedback($('#organizations-empty'), loaded && !shown.length ? 'No organizations match your search and filter.' : '');
  feedback($('#profiles-empty'), loaded && !profiles.length ? 'No profiles match your search and filter.' : '');
  controls();
}
async function load() {
  request?.abort(); if (!account) return;
  const current = request = new AbortController(), actor = account;
  loading = true; loaded = false; directory = { organizations: [], users: [] }; render();
  groups.setAttribute('aria-busy', 'true'); users.setAttribute('aria-busy', 'true'); feedback(state, 'Loading organizations and profiles…');
  try {
    const rows = await loadDealerDirectory(actor, current.signal);
    if (current.signal.aborted) return;
    directory = rows; loaded = true; feedback(state, ''); render();
  } catch (error) { if (!current.signal.aborted) feedback(state, dealerError(error), 'danger'); }
  finally {
    if (!current.signal.aborted) { loading = false; controls(); groups.setAttribute('aria-busy', 'false'); users.setAttribute('aria-busy', 'false'); }
  }
}
async function write(operation, message, editing = false) {
  if (!account || busy || !loaded) return;
  const current = generation; busy = true; controls(); feedback(notice, 'Saving change…');
  try {
    await operation(); if (current !== generation) return;
    if (editing) editor.close();
    feedback(notice, message, 'success'); await load();
  } catch (error) {
    if (current !== generation) return;
    feedback(notice, dealerError(error, true), 'danger'); if (editing) editor.failure(error);
    // An uncertain write may have committed. Require a read before another mutation.
    loaded = false;
  } finally { busy = false; controls(); }
}
async function act(event, kind) {
  const button = event.target.closest('[data-action]'); if (!button || busy || loading || !loaded || !account) return;
  const row = kind === 'organization' ? directory.organizations.find(g => g.id === button.closest('[data-organization-id]').dataset.organizationId)
    : directory.users.find(u => u.id === button.closest('[data-profile-id]').dataset.profileId);
  if (!row) return;
  if (button.dataset.action === 'rename') { editor.open(row); return; }
  const current = generation;
  if (await confirmActivation(row, kind) && current === generation) {
    const active = !row.is_active;
    void write(() => kind === 'organization' ? setOrganizationActive(account, row.id, active) : setDealerProfileActive(account, row.id, active),
      `${kind === 'organization' ? 'Organization' : 'Dealer profile'} ${active ? 'enabled' : 'disabled'}.`);
  }
}
groups.addEventListener('click', event => { void act(event, 'organization'); });
users.addEventListener('click', event => { void act(event, 'profile'); });
for (const input of [search, userSearch]) input.addEventListener('input', render);
for (const select of [filter, userFilter]) select.addEventListener('change', render);
add.addEventListener('click', () => editor.open()); reload.addEventListener('click', () => { void load(); });
void initPage('admin-dealers', next => {
  generation += 1; request?.abort(); account = next; loaded = loading = false; directory = { organizations: [], users: [] };
  editor.close(); if (dialog.open) dialog.close('cancel'); feedback(notice, ''); render();
  if (next) void load(); else feedback(state, 'Checking administrator access…');
});
