import { getSupabase } from './supabase.js';

// getSession waits for SDK initialization/refresh. Do not cache its token or let
// a protected query silently fall back to the publishable key as an anon caller.
export async function sessionAuthorization(expectedUserId, auth = getSupabase().auth) {
  const { data: { session }, error } = await auth.getSession();
  if (error) throw error;
  if (!session?.access_token || (expectedUserId && session.user?.id !== expectedUserId)) {
    throw Object.assign(new Error('Your session changed or ended. Please log in again.'), {
      code: 'portal_session', status: 401,
    });
  }
  return `Bearer ${session.access_token}`;
}
