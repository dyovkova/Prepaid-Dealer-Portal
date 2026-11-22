import { isProductId as isUuid } from '../draft/model.js';

const invalid = message => Object.assign(new Error(message), { code: 'dealer_validation' });
export function organizationValues(values) {
  const name = typeof values.name === 'string' ? values.name.trim() : '';
  if (!name) throw invalid('Enter a nonblank organization name.');
  return { name };
}
export function organization(row) {
  if (!row || !isUuid(row.id) || typeof row.name !== 'string' || !row.name.trim()
    || typeof row.is_active !== 'boolean') throw new Error('Invalid organization data');
  return { id: row.id, name: row.name, is_active: row.is_active };
}
export function dealerDirectory(organizations, profiles, roles) {
  const groups = organizations.map(organization), memberships = new Map(groups.map(g => [g.id, g]));
  const permissions = new Map(roles.map(row => {
    if (!isUuid(row.user_id) || !['admin', 'dealer'].includes(row.role)) throw new Error('Invalid role data');
    return [row.user_id, row.role];
  }));
  const users = profiles.map(row => {
    if (!isUuid(row.id) || typeof row.display_name !== 'string' || typeof row.is_active !== 'boolean'
      || (row.dealer_id !== null && !isUuid(row.dealer_id))) throw new Error('Invalid profile data');
    return { id: row.id, display_name: row.display_name, dealer_id: row.dealer_id, is_active: row.is_active,
      role: permissions.get(row.id) ?? 'unavailable', organization: memberships.get(row.dealer_id) ?? null };
  });
  return { organizations: groups.map(g => ({ ...g, userCount: users.filter(u => u.dealer_id === g.id).length })), users };
}
export function filterOrganizations(rows, term, status) {
  return rows.filter(row => row.name.toLowerCase().includes(term.trim().toLowerCase()) && matches(row, status));
}
export function filterProfiles(rows, term, status) {
  const search = term.trim().toLowerCase();
  return rows.filter(row => `${row.display_name} ${row.organization?.name ?? ''} ${row.role}`.toLowerCase().includes(search) && matches(row, status));
}
function matches(row, status) { return status === 'all' || row.is_active === (status === 'active'); }
export function dealerError(error, writing = false) {
  if (error.code === 'dealer_validation') return error.message;
  if (['23502', '23514'].includes(error.code)) return 'Enter a nonblank organization name and a valid status.';
  if (['42501', 'portal_session', 'admin_required'].includes(error.code) || [401, 403].includes(error.status)) {
    return 'Administrator access is unavailable. Check your session and reload dealer management.';
  }
  if (['22023', 'dealer_unavailable'].includes(error.code)) return 'The record is unavailable or your access changed. Reload dealer management before retrying.';
  return writing ? 'Could not confirm the change. Reload dealer management before retrying; it may already be saved.'
    : 'Could not load dealer management. Check your connection and reload.';
}
