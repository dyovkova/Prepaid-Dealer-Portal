// Explicitly authorized hosted fixture checks only: temporary activation/archive
// flags are restored. No migrations, membership changes, Auth Admin API or new orders.
import assert from 'node:assert/strict';
import { capture,state,save,query,literal,login,request,rpc,ok,denied,setFixtureActive } from './order_live_support.mjs';

assert.equal(process.env.PDP_HISTORY_FIXTURE_TESTS,'1','Requires explicit authorization for temporary hosted status/archive fixtures');
const account=state('.verification/identity-live-state.json').a;
const admin=state('.verification/demo-admin-candidate.json');
const before=capture(),report={passed:[],completed:false};
const product=before.products.find(p=>p.sku==='PDP-DEMO-CREDIT-005');
const own=before.orders.filter(o=>o.dealer_id===account.dealerId);
const items=before.items.filter(i=>own.some(o=>o.id===i.order_id));
const original=own.find(o=>o.created_by===account.id);
const replay={p_request_id:original?.request_id,p_note:original?.note,
  p_items:items.filter(i=>i.order_id===original?.id).map(i=>({product_id:i.product_id,quantity:i.quantity}))};
let pending=null,stage='fixture preconditions';
const pass=label=>{report.passed.push(label);console.log(`PASS ${label}`);};
const recovery=()=>save('.verification/history-fixture-recovery.json',{
  pending,accountId:account.id,dealerId:account.dealerId,productId:product?.id,originalActive:true,
});
function flag(kind,active) {
  if(kind!=='product')return setFixtureActive(account,kind==='organization',active);
  const changed=query(`UPDATE public.products SET is_active=${active}
    WHERE id=${literal(product.id)}::uuid AND sku=${literal(product.sku)} AND name=${literal(product.name)}
    AND description=${literal(product.description)} AND unit_price=${literal(product.unit_price)}::numeric
    AND created_at=${literal(product.created_at)}::timestamptz RETURNING id`,true);
  assert.equal(changed.length,1,'Only the exact recorded synthetic product may change');
}
async function withFixture(kind,check) {
  pending=kind;recovery();
  try {flag(kind,false);await check();}
  finally {flag(kind,true);pending=null;recovery();}
  assert.deepEqual(capture(),before,`Fully restore ${kind}`);
}
const itemColumns='order_id,product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot';
const item=row=>({...Object.fromEntries(itemColumns.split(',').map(k=>[k,row[k]])),unit_price_snapshot:Number(row.unit_price_snapshot)});
const sorted=rows=>[...rows].sort((a,b)=>(a.id??`${a.order_id}:${a.product_id}`).localeCompare(b.id??`${b.order_id}:${b.product_id}`));
async function readable(token,active) {
  assert.deepEqual(sorted(ok(await request('/rest/v1/orders?select=id',token))),sorted(active?own.map(o=>({id:o.id})):[]));
  assert.deepEqual(sorted(ok(await request(`/rest/v1/order_items?select=${itemColumns}`,token))),sorted(active?items.map(item):[]));
  for(const order of own)for(const [path,expected]of [
    [`orders?select=id&id=eq.${order.id}`,active?[{id:order.id}]:[]],
    [`order_items?select=${itemColumns}&order_id=eq.${order.id}`,active?items.filter(i=>i.order_id===order.id).map(item):[]],
  ])assert.deepEqual(sorted(ok(await request(`/rest/v1/${path}`,token))),sorted(expected));
}
async function writesDenied(token) {
  for(const table of ['orders','order_items']) {
    denied(await request(`/rest/v1/${table}`,token,'POST',{}));
    const filter=table==='orders'?'id':'order_id';
    const path=`/rest/v1/${table}?${filter}=eq.00000000-0000-4000-8000-000000007aff`;
    denied(await request(path,token,'PATCH',table==='orders'?{status:'submitted'}:{quantity:1}));
    denied(await request(path,token,'DELETE'));
  }
}
try {
  assert.equal(before.history.at(-1).version,'20261121000500');
  assert.ok(product?.is_active&&original&&replay.p_items.length&&items.some(i=>i.product_id===product.id));
  assert.equal(before.profiles.find(p=>p.id===account.id)?.is_active,true);
  assert.equal(before.dealers.find(d=>d.id===account.dealerId)?.is_active,true);
  assert.equal(before.roles.find(r=>r.user_id===account.id)?.role,'dealer');
  const guard=query(`SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=${literal(account.id)}::uuid
    AND u.email=${literal(account.email)} AND u.raw_user_meta_data->>'test_fixture'='milestone4a') AS verified`);
  assert.equal(guard[0].verified,true);
  const grants=query(`SELECT has_table_privilege(r,t,'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
    FROM unnest(ARRAY['anon','authenticated']) r CROSS JOIN unnest(ARRAY['public.orders','public.order_items']) t`);
  assert.ok(grants.every(g=>!g.can_write),'Stop before any HTTP write attempt if grants differ');
  const token=await login(account),adminToken=await login(admin);
  stage='direct client write denials';
  for(const actor of [token,adminToken,null])await writesDenied(actor);
  pass('real dealer/admin/anonymous INSERT, PATCH and DELETE denied; probes cannot insert valid rows or target existing UUIDs');
  stage='inactive profile with unchanged JWT';
  await withFixture('profile',async()=>{
    await readable(token,false);denied(await rpc(token,replay));await writesDenied(token);
    assert.equal(ok(await request(`/rest/v1/profiles?select=is_active&id=eq.${account.id}`,token))[0].is_active,false);
  });
  await readable(token,true);assert.equal(ok(await rpc(token,replay)),original.id);
  pass('same issued dealer JWT loses order/item lists, direct UUID reads and RPC replay for inactive profile; exact restoration recovers access');
  stage='inactive organization with unchanged JWT';
  await withFixture('organization',async()=>{await readable(token,false);denied(await rpc(token,replay));});
  await readable(token,true);assert.equal(ok(await rpc(token,replay)),original.id);
  pass('same issued JWT loses order/item access and RPC replay for inactive organization; exact restoration recovers access');
  stage='archived product snapshot preservation';
  await withFixture('product',async()=>{
    assert.deepEqual(ok(await request(`/rest/v1/products?select=id&id=eq.${product.id}`,token)),[]);
    await readable(token,true);assert.equal(ok(await rpc(token,replay)),original.id);
  });
  pass('archived product disappears from dealer catalog while saved order SKU/name/price snapshots remain readable; exact RPC retry returns the original UUID');
  stage='final preservation';assert.deepEqual(capture(),before);
  report.completed=true;report.counts={orders:before.orders.length,items:before.items.length};
  pass('all temporary flags, identities, catalog, orders/items, policies and migration history restored/preserved; no new orders');
} catch {
  report.failure=stage;console.error(`FAIL hosted history fixture check: ${stage}`);process.exitCode=1;
} finally {
  if(pending)try {flag(pending,true);pending=null;recovery();}catch {report.restorationRequired=pending;console.error('Fixture restoration requires attention; see ignored recovery file');process.exitCode=1;}
  save('.verification/order-history-fixture-report.json',report);
}
