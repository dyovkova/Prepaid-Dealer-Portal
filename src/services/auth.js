import { getSupabase } from './supabase.js';
import { sessionAuthorization, verifySessionUser } from './session.js';

export async function loadAccount() {
  const client = getSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return null;
  const user = await verifySessionUser(session);
  const authorization = await sessionAuthorization(user.id);
  const [profileResult, roleResult] = await Promise.all([
    client.from('profiles').select('id,dealer_id,display_name,is_active').eq('id', user.id).setHeader('Authorization', authorization).maybeSingle(),
    client.from('user_roles').select('user_id,role').eq('user_id', user.id).setHeader('Authorization', authorization).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (roleResult.error) throw roleResult.error;
  const profile = profileResult.data;
  const role = roleResult.data?.role;
  const account = { userId: user.id, profile, role, status: 'incomplete' };
  if (!profile || !['dealer', 'admin'].includes(role)) return account;
  if (!profile.is_active) return { ...account, status: 'inactive-profile' };
  if (role === 'admin') return { ...account, status: 'active' };
  if (!profile.dealer_id) return account;
  const { data: dealer, error } = await client.from('dealers')
    .select('id,name,is_active').eq('id', profile.dealer_id)
    .setHeader('Authorization', await sessionAuthorization(user.id)).maybeSingle();
  if (error) throw error;
  // RLS intentionally hides inactive organizations, while own profile/role stay readable.
  return { ...account, dealer, status: dealer?.is_active ? 'active' : 'inactive-dealer' };
}

export async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function register({ email, password, displayName, businessName }) {
  const { data, error } = await getSupabase().auth.signUp({
    email, password, options: { data: { display_name: displayName, business_name: businessName } },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) throw error;
}
