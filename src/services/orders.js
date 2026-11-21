import { getSupabase } from './supabase.js';
import { verifySessionUser } from './session.js';
import { isProductId } from '../draft/model.js';

export async function submitOrder(ownerId, payload) {
  const client = getSupabase();
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session) throw Object.assign(new Error('Sign in again to retry your saved request.'), { code: 'order_session_changed' });
  const user = await verifySessionUser(session).catch(() => null);
  if (user?.id !== ownerId) throw Object.assign(new Error('The signed-in account changed. Sign in to the original account to retry.'), { code: 'order_session_changed' });
  // Bind this attempt to the verified owner's token, even if another tab changes
  // the SDK session while the RPC is in flight. The JWT is never persisted here.
  const { data, error } = await client.rpc('submit_order', payload)
    .setHeader('Authorization', `Bearer ${session.access_token}`).abortSignal(AbortSignal.timeout(15000));
  if (error) throw error;
  if (!isProductId(data)) throw new Error('The server response did not confirm an order UUID.');
  return data;
}
