import { getSupabase } from './supabase.js';

const endedSession = () => Object.assign(new Error('Your session changed or ended. Please log in again.'), {
  code: 'portal_session', status: 401,
});

// A background identity read must not remove a newer login. getUser() in the
// installed SDK can remove session storage on a delayed session_not_found error.
// Verify with the same Auth endpoint/JWT, without changing SDK session state.
export async function verifySessionUser(session) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  if ([401, 403].includes(response.status)) throw endedSession();
  if (!response.ok) throw new Error('Identity verification is unavailable.');
  const user = await response.json();
  if (!user?.id || user.id !== session.user?.id) throw endedSession();
  await sessionAuthorization(user.id);
  return user;
}

// getSession waits for SDK initialization/refresh. Do not cache its token or let
// a protected query silently fall back to the publishable key as an anon caller.
export async function sessionAuthorization(expectedUserId, auth = getSupabase().auth) {
  const { data: { session }, error } = await auth.getSession();
  if (error) throw error;
  if (!session?.access_token || (expectedUserId && session.user?.id !== expectedUserId)) {
    throw endedSession();
  }
  return `Bearer ${session.access_token}`;
}
