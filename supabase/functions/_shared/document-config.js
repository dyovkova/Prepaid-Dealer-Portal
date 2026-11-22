export function documentConfig() {
  const key = (dictionary, legacy) => {
    const value = Deno.env.get(dictionary);
    return (value ? JSON.parse(value).default : null) ?? Deno.env.get(legacy);
  };
  const url = Deno.env.get('SUPABASE_URL'), publicKey = key('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) throw new Error('Document server configuration is missing.');
  return { url, publicKey, secretKey };
}
