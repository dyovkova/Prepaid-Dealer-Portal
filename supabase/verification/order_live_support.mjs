// Hosted verification helpers. Public Auth/Data API only; trusted SQL is bounded
// to inspection, rollback suites and restoration of a recorded synthetic dealer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { loadEnv } from 'vite';

export const project='niabpabsvdgxackjjcsb';
const origin=`https://${project}.supabase.co`;
const env=loadEnv('production',process.cwd(),'VITE_');
assert.equal(env.VITE_SUPABASE_URL,origin);
assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'),'Public configuration is required');
export const literal=v=>`'${String(v).replaceAll("'","''")}'`;
export const state=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export const exists=existsSync;
export const save=(path,value)=>{mkdirSync('.verification',{recursive:true});writeFileSync(path,JSON.stringify(value,null,2),{mode:0o600});};
export function cli(args) {
  try {return JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024}));}
  catch {throw new Error('Trusted CLI verification failed; credentials are not logged');}
}
export const query=(sql,write=false)=>cli(['db','query',`--remote=${project}`,...(write?['--yes']:['--read-only']),'--',sql]).rows;
export const capture=()=>query(`SELECT json_build_object(
  'auth',(SELECT json_agg(json_build_object('id',id,'email',email,'confirmed',email_confirmed_at) ORDER BY id) FROM auth.users),
  'profiles',(SELECT json_agg(row_to_json(p) ORDER BY id) FROM public.profiles p),
  'dealers',(SELECT json_agg(row_to_json(d) ORDER BY id) FROM public.dealers d),
  'roles',(SELECT json_agg(row_to_json(r) ORDER BY user_id) FROM public.user_roles r),
  'products',(SELECT json_agg(row_to_json(p) ORDER BY sku) FROM public.products p),
  'orders',COALESCE((SELECT json_agg(row_to_json(o) ORDER BY id) FROM public.orders o),'[]'::json),
  'items',COALESCE((SELECT json_agg(row_to_json(i) ORDER BY order_id,product_id) FROM public.order_items i),'[]'::json),
  'history',(SELECT json_agg(row_to_json(m) ORDER BY version) FROM supabase_migrations.schema_migrations m),
  'policies',(SELECT json_agg(row_to_json(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public')
  ) AS snapshot`)[0].snapshot;
export async function request(path,token,method='GET',body,extraHeaders={}) {
  const result=await fetch(origin+path,{method,signal:AbortSignal.timeout(20000),
    headers:{apikey:env.VITE_SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:`Bearer ${token}`} : {}),
      ...(body!==undefined?{'Content-Type':'application/json'}:{}),...extraHeaders},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await result.text();return {status:result.status,body:text?JSON.parse(text):null};
}
export const rpc=(token,body)=>request('/rest/v1/rpc/submit_order',token,'POST',body);
export function ok(result) {
  assert.ok(result.status>=200&&result.status<300,`Expected API success: ${result.status}/${result.body?.code??result.body?.error_code??'unknown'}`);
  return result.body;
}
export function denied(result) {assert.ok([401,403].includes(result.status));assert.equal(result.body?.code,'42501');}
export async function login(account) {
  const session=ok(await request('/auth/v1/token?grant_type=password',null,'POST',{email:account.email,password:account.password}));
  assert.equal(session.user.id,account.id);assert.ok(session.access_token&&session.refresh_token);
  assert.equal(ok(await request('/auth/v1/user',session.access_token)).id,account.id);
  return session.access_token;
}
export function checkPreserved(before,after) {
  for(const key of ['auth','profiles','dealers','roles','products','history','policies']) assert.deepEqual(after[key],before[key],`Preserve ${key}`);
  for(const row of before.orders) assert.deepEqual(after.orders.find(o=>o.id===row.id),row);
  for(const row of before.items) assert.deepEqual(after.items.find(i=>i.order_id===row.order_id&&i.product_id===row.product_id),row);
}
export function setFixtureActive(account,organization,active) {
  const guard=`u.id=${literal(account.id)}::uuid AND u.email=${literal(account.email)}
    AND u.raw_user_meta_data->>'test_fixture'='milestone4a' AND r.role='dealer'`;
  const sql=organization
    ? `UPDATE public.dealers d SET is_active=${active} FROM public.profiles p JOIN auth.users u ON u.id=p.id JOIN public.user_roles r ON r.user_id=p.id
       WHERE d.id=p.dealer_id AND d.id=${literal(account.dealerId)}::uuid AND ${guard} RETURNING d.id`
    : `UPDATE public.profiles p SET is_active=${active} FROM auth.users u JOIN public.user_roles r ON r.user_id=u.id
       WHERE p.id=u.id AND p.dealer_id=${literal(account.dealerId)}::uuid AND ${guard} RETURNING p.id`;
  assert.equal(query(sql,true).length,1,'Only the recorded controlled dealer may change');
}
