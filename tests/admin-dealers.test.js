import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationValues, organization, dealerDirectory, filterOrganizations, filterProfiles, dealerError } from '../src/admin-dealers/model.js';
const groupId = '00000000-0000-4000-8000-000000000001', userId = '00000000-0000-4000-8000-000000000002';
const group = { id: groupId, name: 'Demo organization', is_active: true };
const user = { id: userId, dealer_id: groupId, display_name: 'Demo user', is_active: false };

test('organization writes whitelist a trimmed name without accepting status, identity or role', () => {
  assert.deepEqual(organizationValues({ name: '  Demo  ', is_active: false, id: userId, role: 'admin' }), { name: 'Demo' });
  for (const name of ['', ' \n ', null, 123]) assert.throws(() => organizationValues({ name }), { code: 'dealer_validation' });
  assert.throws(() => organization({ ...group, is_active: 'true' }));
  assert.throws(() => organization({ ...group, id: 'bad' }));
});
test('directory counts every associated profile, including inactive users; roles come from database rows', () => {
  const rows = dealerDirectory([group], [user, { ...user, id: groupId, is_active: true }], [{ user_id: userId, role: 'dealer' }]);
  assert.equal(rows.organizations[0].userCount, 2);
  assert.equal(rows.users[0].role, 'dealer'); assert.equal(rows.users[0].organization.name, group.name);
  assert.equal(rows.users[1].role, 'unavailable');
  assert.equal(dealerDirectory([group], [{ ...user, dealer_id: null }], []).organizations[0].userCount, 0);
  assert.throws(() => dealerDirectory([group], [user], [{ user_id: userId, role: 'owner' }]));
});
test('profile and organization statuses remain independent, with no fabricated organization or role', () => {
  const { users } = dealerDirectory([{ ...group, is_active: false }], [{ ...user, is_active: true }], [{ user_id: userId, role: 'dealer' }]);
  assert.equal(users[0].is_active, true); assert.equal(users[0].organization.is_active, false);
  assert.equal(dealerDirectory([], [user], []).users[0].organization, null);
  assert.throws(() => dealerDirectory([], [{ ...user, dealer_id: 'bad' }], []));
});
test('search and status filters use organization names, display names and database roles', () => {
  const rows = dealerDirectory([group, { ...group, id: userId, name: 'Other', is_active: false }], [user], [{ user_id: userId, role: 'dealer' }]);
  assert.equal(filterOrganizations(rows.organizations, ' DEMO ', 'active').length, 1);
  assert.equal(filterOrganizations(rows.organizations, '', 'inactive').length, 1);
  assert.equal(filterProfiles(rows.users, 'demo organization', 'inactive').length, 1);
  assert.equal(filterProfiles(rows.users, 'DEALER', 'active').length, 0);
  assert.equal(filterProfiles(rows.users, 'missing', 'all').length, 0);
});
test('failures distinguish validation, changed access, and uncertain writes without leaking server messages', () => {
  assert.match(dealerError({ code: 'dealer_validation', message: 'Enter a name' }), /Enter a name/);
  assert.match(dealerError({ code: '42501', message: 'private details' }), /Administrator access/);
  assert.match(dealerError({ code: '22023' }), /access changed/);
  assert.match(dealerError({}, true), /may already be saved/);
  assert.match(dealerError({}), /Could not load/);
});
