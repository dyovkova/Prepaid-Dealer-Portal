// Opt-in public Auth/Data API verification for the selected demo project.
// Never calls the Auth Admin API. Passwords stay in ignored local fixture state;
// session tokens and the public API key are never printed or written to reports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

assert.equal(process.env.PDP_LIVE_TESTS, '1', 'Set PDP_LIVE_TESTS=1 to authorize live fixture tests');
const emails = [process.env.PDP_TEST_EMAIL_A, process.env.PDP_TEST_EMAIL_B];
assert(emails.every(email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  'Provide two controlled fixture email addresses through PDP_TEST_EMAIL_A/B');
assert.notEqual(emails[0].toLowerCase(), emails[1].toLowerCase());
const project = 'niabpabsvdgxackjjcsb';
const origin = `https://${project}.supabase.co`;
const statePath = new URL('../../.verification/identity-live-state.json', import.meta.url);
const reportPath = new URL('../../.verification/identity-live-results.json', import.meta.url);
const cliPath = fileURLToPath(new URL('../../node_modules/supabase/dist/supabase.js', import.meta.url));
const cli = (...args) => {
  try {
    return JSON.parse(execFileSync(process.execPath, [cliPath, ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }));
  } catch {
    throw new Error('Supabase CLI verification failed; inspect using the CLI without logging credentials');
  }
};
const query = (sql, write = false) => cli('db', 'query', `--remote=${project}`,
  ...(write ? ['--yes'] : ['--read-only']), '--', sql).rows;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const findKeys = value => Array.isArray(value) ? value : Object.values(value)
  .flatMap(child => child && typeof child === 'object' ? findKeys(child) : []);
const keys = findKeys(cli('projects', 'api-keys', `--remote=${project}`, '--output-format', 'json'));
const publicKey = keys.find(key => key.name === 'anon')?.api_key;
assert(publicKey, 'Public API key is unavailable');
const checks = [];
const passed = name => { checks.push(name); console.log(`Passed: ${name}`); };
const request = async (route, token, { method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(`${origin}${route}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { apikey: publicKey, ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const content = await response.text();
  return { status: response.status, body: content ? JSON.parse(content) : null };
};
const ok = result => {
  assert(result.status >= 200 && result.status < 300,
    `API request failed: HTTP ${result.status}, code ${result.body?.error_code ?? result.body?.code ?? 'unknown'}`);
  return result.body;
};
const denied = result => {
  assert([401, 403].includes(result.status), `Expected permission denial, got HTTP ${result.status}`);
  assert.equal(result.body?.code, '42501');
};
const get = async (table, session, filter = '') => ok(await request(
  `/rest/v1/${table}?select=*${filter}`, session.token));
const patch = (table, session, filter, body) => request(`/rest/v1/${table}?${filter}`, session.token,
  { method: 'PATCH', body, headers: { Prefer: 'return=representation' } });
const fixtureGuard = id => `u.id=${literal(id)}::uuid AND u.raw_user_meta_data->>'test_fixture'='milestone4a'`;
const activation = (account, active, organization = false) => {
  const sql = organization
    ? `UPDATE public.dealers d SET is_active=${active} FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE d.id=p.dealer_id AND ${fixtureGuard(account.id)} RETURNING d.id`
    : `UPDATE public.profiles p SET is_active=${active} FROM auth.users u WHERE p.id=u.id AND ${fixtureGuard(account.id)} RETURNING p.id`;
  assert.equal(query(sql, true).length, 1, 'Fixture activation must affect exactly one row');
};
let state = {};
try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const save = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
await mkdir(new URL('../../.verification/', import.meta.url), { recursive: true });
const sessions = [];
let needsRestoration = false;
let initialProfile;

try {
  const settings = ok(await request('/auth/v1/settings'));
  assert.equal(settings.mailer_autoconfirm, true, 'This demo run requires the user-approved confirmation-disabled setting');
  passed('demo email confirmation setting verified through public Auth settings');
  const existing = query(`SELECT id,email,raw_user_meta_data->>'test_fixture' AS marker FROM auth.users WHERE email IN (${emails.map(literal).join(',')})`);
  for (let i = 0; i < 2; i++) {
    const label = i === 0 ? 'a' : 'b';
    const found = existing.find(user => user.email.toLowerCase() === emails[i].toLowerCase());
    if (found) assert(state[label]?.id === found.id && found.marker === 'milestone4a',
      'Address already belongs to an account outside this recorded fixture run; stopping');
    if (!state[label]) {
      state[label] = { email: emails[i], password: `${randomBytes(24).toString('base64url')}aA1!` };
      await save();
    }
    const account = state[label];
    assert.equal(account.email.toLowerCase(), emails[i].toLowerCase(), 'Fixture state email differs');
    if (!account.id) {
      const metadata = { test_fixture: 'milestone4a', display_name: `Synthetic Dealer ${label.toUpperCase()}`,
        business_name: 'Synthetic SoftUni 4A organization' };
      if (i === 1) Object.assign(metadata, { role: 'admin', dealer_id: state.a.dealerId,
        id: state.a.id, user_id: state.a.id, is_active: false });
      const signup = ok(await request('/auth/v1/signup', null,
        { method: 'POST', body: { email: account.email, password: account.password, data: metadata } }));
      assert(signup.user?.id && signup.access_token, 'Public signup must return a real user and session');
      account.id = signup.user.id;
      account.publicSignup = true;
      await save();
      passed(`public Auth signup and initial session ${label.toUpperCase()}`);
    }
    assert(account.publicSignup, 'Fixture was not created through the public signup endpoint');
    const login = ok(await request('/auth/v1/token?grant_type=password', null,
      { method: 'POST', body: { email: account.email, password: account.password } }));
    assert.equal(login.user.id, account.id);
    assert(login.access_token && login.refresh_token && login.expires_in > 0);
    const session = { token: login.access_token, id: account.id };
    sessions.push(session);
    assert.equal(ok(await request('/auth/v1/user', session.token)).id, account.id);
    passed(`password login and authenticated Auth session ${label.toUpperCase()}`);
    const profiles = await get('profiles', session);
    const roles = await get('user_roles', session);
    const organizations = await get('dealers', session);
    assert.equal(profiles.length, 1); assert.equal(roles.length, 1); assert.equal(organizations.length, 1);
    assert.equal(profiles[0].id, account.id); assert.equal(profiles[0].is_active, true);
    assert.deepEqual(roles[0], { user_id: account.id, role: 'dealer' });
    assert.equal(organizations[0].id, profiles[0].dealer_id); assert.equal(organizations[0].is_active, true);
    account.dealerId = profiles[0].dealer_id;
    account.originalName ??= profiles[0].display_name;
    await save();
    passed(`one isolated active organization, profile and fixed dealer role ${label.toUpperCase()}`);
  }
  assert.notEqual(state.a.dealerId, state.b.dealerId);
  passed('forged signup admin/membership/activation metadata ignored');

  const counts = query(`SELECT (SELECT count(*) FROM public.profiles WHERE id IN (${literal(state.a.id)},${literal(state.b.id)}))::int AS profiles,
    (SELECT count(*) FROM public.user_roles WHERE user_id IN (${literal(state.a.id)},${literal(state.b.id)}))::int AS roles,
    (SELECT count(*) FROM public.dealers WHERE id IN (${literal(state.a.dealerId)},${literal(state.b.dealerId)}))::int AS dealers`)[0];
  assert.deepEqual(counts, { profiles: 2, roles: 2, dealers: 2 });
  let suite = await readFile(new URL('test_identity_access.sql', import.meta.url), 'utf8');
  suite = suite.replace(/^BEGIN;/m, `BEGIN; SELECT set_config('pdp.test_email_a',${literal(emails[0])},true); SELECT set_config('pdp.test_email_b',${literal(emails[1])},true);`);
  assert.match(query(suite, true)[0].result, /^passed;/);
  passed('hosted PostgreSQL rollback fixture, inactive/admin/missing-role, grant and non-recursion suite');

  for (let i = 0; i < 2; i++) {
    const session = sessions[i]; const own = i === 0 ? state.a : state.b; const other = i === 0 ? state.b : state.a;
    for (const [table, filter] of [['profiles', `&id=eq.${other.id}`], ['user_roles', `&user_id=eq.${other.id}`], ['dealers', `&id=eq.${other.dealerId}`]])
      assert.deepEqual(await get(table, session, filter), []);
    assert.deepEqual(ok(await patch('profiles', session, `id=eq.${other.id}`, { display_name: 'Forbidden cross-account edit' })), []);
    const joined = ok(await request('/rest/v1/profiles?select=id,user_roles(role),dealers(id)', session.token));
    assert.equal(joined.length, 1); assert.equal(joined[0].id, own.id);
    passed(`cross-account reads/updates denied; joined RLS reads do not recurse ${i + 1}`);
    for (const [table, filter, body] of [
      ['user_roles', `user_id=eq.${own.id}`, { role: 'admin' }],
      ['profiles', `id=eq.${own.id}`, { dealer_id: other.dealerId }],
      ['profiles', `id=eq.${own.id}`, { is_active: false }],
      ['dealers', `id=eq.${own.dealerId}`, { is_active: false }],
    ]) denied(await patch(table, session, filter, body));
    passed(`role, organization reassignment and activation changes denied ${i + 1}`);
    const changed = ok(await patch('profiles', session, `id=eq.${own.id}`, { display_name: 'Synthetic allowed name edit' }));
    assert.equal(changed.length, 1);
    assert.equal(changed[0].dealer_id, own.dealerId);
    ok(await patch('profiles', session, `id=eq.${own.id}`, { display_name: own.originalName }));
    for (const table of ['products', 'orders', 'order_items']) {
      const column = table === 'order_items' ? 'order_id' : 'id';
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const body = method === 'POST' ? {} : method === 'PATCH' ? { [table === 'products' ? 'unit_price' : table === 'orders' ? 'status' : 'quantity']: table === 'orders' ? 'completed' : 1 } : undefined;
        denied(await request(`/rest/v1/${table}?${column}=eq.${own.id}`, session.token, { method, body }));
      }
    }
    passed(`catalog and orders remain default-deny for session ${i + 1}`);
  }

  initialProfile = (await get('profiles', sessions[0]))[0];
  needsRestoration = true;
  activation(state.a, false);
  assert.equal((await get('profiles', sessions[0]))[0].is_active, false);
  assert.equal((await get('user_roles', sessions[0]))[0].role, 'dealer');
  assert.deepEqual(await get('dealers', sessions[0]), []);
  assert.deepEqual(ok(await patch('profiles', sessions[0], `id=eq.${state.a.id}`, { display_name: 'Forbidden inactive edit' })), []);
  passed('inactive profile loses organization access and name edits with the same issued JWT');
  activation(state.a, true);
  activation(state.a, false, true);
  assert.equal((await get('profiles', sessions[0]))[0].is_active, true);
  assert.deepEqual(await get('dealers', sessions[0]), []);
  assert.deepEqual(ok(await patch('profiles', sessions[0], `id=eq.${state.a.id}`, { display_name: 'Forbidden inactive organization edit' })), []);
  passed('inactive organization loses access and name edits with the same issued JWT');
  activation(state.a, true, true);
  for (const helper of ['is_active_admin', 'current_active_dealer_id', 'provision_dealer_account']) {
    for (const schema of ['private', 'public']) {
      const result = await request(`/rest/v1/rpc/${helper}`, sessions[0].token,
        { method: 'POST', body: {}, headers: { 'Content-Profile': schema } });
      assert.equal(result.status, schema === 'private' ? 406 : 404);
      assert.equal(result.body.code, schema === 'private' ? 'PGRST106' : 'PGRST202');
    }
  }
  passed('private helper RPCs remain unexposed for a real authenticated session');
} catch (error) {
  console.error(`Live verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (needsRestoration) {
    try {
      activation(state.a, true);
      activation(state.a, true, true);
      const restored = (await get('profiles', sessions[0]))[0];
      assert.equal(restored.is_active, initialProfile.is_active);
      assert.equal(restored.display_name, initialProfile.display_name);
      assert.equal(restored.dealer_id, initialProfile.dealer_id);
      assert.equal((await get('dealers', sessions[0]))[0].is_active, true);
      passed('fixture activation, membership and names restored after live checks');
    } catch {
      console.error('Fixture restoration needs operator attention; only this run\'s recorded synthetic account was targeted.');
      process.exitCode = 1;
    }
  }
  await writeFile(reportPath, JSON.stringify({ project, passed: !process.exitCode,
    emailConfirmation: 'temporarily disabled by the user for the demo', checks,
    publicSignupAccounts: Object.values(state).filter(value => value?.publicSignup).length,
    fixtureAccountsRetained: Object.values(state).filter(value => value?.publicSignup).length,
    privilegedAuthAdminApiUsed: false }, null, 2));
  if (!process.exitCode) console.log(`Passed ${checks.length} live verification groups; no Admin API used.`);
}
