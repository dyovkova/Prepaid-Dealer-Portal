import { getSupabase } from './supabase.js';
import { sessionAuthorization } from './session.js';
import { isProductId as isUuid } from '../draft/model.js';
import { dealerDirectory, organization, organizationValues } from '../admin-dealers/model.js';

async function authorization(account) {
  if (account?.role !== 'admin' || account.status !== 'active' || !isUuid(account.userId)) {
    throw Object.assign(new Error('Active administrator required'), { code: 'admin_required' });
  }
  return sessionAuthorization(account.userId); // Current JWT; RLS authorizes every operation.
}
async function readAll(account, table, fields, key, signal) {
  const rows = [], size = 200;
  for (let start = 0; ; start += size) {
    const header = await authorization(account);
    const { data, error } = await getSupabase().from(table).select(fields).order(key).range(start, start + size - 1)
      .setHeader('Authorization', header)
      .abortSignal(AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]));
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Directory unavailable');
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
export async function loadDealerDirectory(account, signal) {
  const [groups, users, roles] = await Promise.all([
    readAll(account, 'dealers', 'id,name,is_active', 'id', signal),
    readAll(account, 'profiles', 'id,dealer_id,display_name,is_active', 'id', signal),
    readAll(account, 'user_roles', 'user_id,role', 'user_id', signal),
  ]);
  return dealerDirectory(groups, users, roles);
}
async function changed(account, query) {
  const header = await authorization(account);
  const { data, error, status } = await query.select('id,name,is_active').setHeader('Authorization', header)
    .abortSignal(AbortSignal.timeout(15000)).maybeSingle();
  if (error) throw Object.assign(error, { status });
  if (!data) throw Object.assign(new Error('Organization unavailable'), { code: 'dealer_unavailable' });
  return organization(data);
}
export async function saveOrganization(account, values, id = null) {
  const payload = organizationValues(values);
  if (id !== null && !isUuid(id)) throw new Error('Invalid organization ID');
  const table = getSupabase().from('dealers');
  return changed(account, id ? table.update(payload).eq('id', id) : table.insert(payload));
}
export async function setOrganizationActive(account, id, active) {
  if (!isUuid(id) || typeof active !== 'boolean') throw new Error('Invalid organization status');
  return changed(account, getSupabase().from('dealers').update({ is_active: active }).eq('id', id));
}
export async function setDealerProfileActive(account, id, active) {
  if (!isUuid(id) || typeof active !== 'boolean') throw new Error('Invalid profile status');
  const header = await authorization(account);
  const { data, error, status } = await getSupabase().rpc('set_dealer_profile_active', { p_profile_id: id, p_is_active: active })
    .setHeader('Authorization', header).abortSignal(AbortSignal.timeout(15000));
  if (error) throw Object.assign(error, { status });
  if (data !== id) throw Object.assign(new Error('Profile unavailable'), { code: 'dealer_unavailable' });
}
