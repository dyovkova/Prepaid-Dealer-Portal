function card(id, kind, title) {
  const column = document.createElement('div');
  column.className = 'col-md-6 col-xl-4'; column.dataset[kind === 'organization' ? 'organizationId' : 'profileId'] = id;
  column.innerHTML = `<article class="card h-100"><div class="card-body d-flex flex-column">
    <h3 class="h5 product-description"></h3><p><span data-status class="badge"></span></p>
    <div data-details class="flex-grow-1"></div><div data-actions class="d-flex flex-wrap gap-2 mt-3"></div>
  </div></article>`;
  column.querySelector('h3').textContent = title;
  return column;
}
function status(column, active) {
  const badge = column.querySelector('[data-status]');
  badge.textContent = active ? 'Active' : 'Inactive'; badge.classList.add(active ? 'text-bg-success' : 'text-bg-secondary');
}
function detail(column, text) {
  const p = document.createElement('p'); p.className = 'text-secondary product-description mb-2'; p.textContent = text;
  column.querySelector('[data-details]').append(p);
}
function action(column, type, text) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-primary';
  button.dataset.action = type; button.textContent = text; column.querySelector('[data-actions]').append(button);
}
export function organizationCard(group) {
  const column = card(group.id, 'organization', group.name); status(column, group.is_active);
  detail(column, `${group.userCount} associated user${group.userCount === 1 ? '' : 's'}`);
  detail(column, 'Organization status controls business access for all its dealer users. Individual profile status is separate.');
  action(column, 'rename', 'Rename organization');
  action(column, 'status', group.is_active ? 'Disable organization' : 'Enable organization');
  return column;
}
export function profileCard(user) {
  const column = card(user.id, 'profile', user.display_name); status(column, user.is_active);
  detail(column, `Organization: ${user.organization?.name ?? 'Not available'}`);
  detail(column, `Database role: ${user.role}`);
  if (user.role === 'dealer' && user.organization) {
    detail(column, user.organization.is_active ? 'Organization is active. This profile must also be active for business access.'
      : 'Organization is inactive. Business access stays blocked even if this profile is enabled.');
    action(column, 'profile-status', user.is_active ? 'Disable user' : 'Enable user');
  } else detail(column, 'Read-only profile. Only dealer users with organization membership can be activated here.');
  return column;
}
export function confirmActivation(record, kind) {
  const dialog = document.querySelector('#dealer-confirm'), disabling = record.is_active;
  const label = disabling ? 'Disable' : 'Enable', subject = kind === 'organization' ? 'organization' : 'user';
  dialog.querySelector('h2').textContent = `${label} ${subject}?`;
  dialog.querySelector('p').textContent = kind === 'organization'
    ? `${label} ${record.name}? ${disabling ? 'All dealer users in this organization will lose business access. Their individual profile statuses and saved orders stay unchanged.' : 'Business access returns only for individually active dealer users.'}`
    : `${label} ${record.display_name}? ${disabling ? 'Only this user loses business access; colleagues and saved orders stay unchanged.' : 'Business access returns only if the organization is also active.'}`;
  dialog.querySelector('[value="confirm"]').textContent = `${label} ${subject}`;
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
