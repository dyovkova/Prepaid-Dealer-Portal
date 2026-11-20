import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabase() {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co')
      && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search;
  } catch { /* Report configuration without exposing its values. */ }
  if (!validUrl || !key?.startsWith('sb_publishable_')) {
    throw Object.assign(new Error('Supabase public configuration is missing or invalid.'), { code: 'portal_config' });
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: (input, init = {}) => fetch(input, {
      ...init, signal: init.signal ?? AbortSignal.timeout(15000),
    }) },
  });
  return client;
}
