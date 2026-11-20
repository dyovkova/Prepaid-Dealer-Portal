// Opt-in real hosted RPC tests. Retains exactly three synthetic demo orders.
// Reuses existing accounts/request IDs; no signup/Admin API/schema/seed changes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { project,state,exists,save,cli,capture,request,rpc,ok,denied,login,checkPreserved,setFixtureActive,literal } from './order_live_support.mjs';

assert.equal(process.env.PDP_ORDER_LIVE_TESTS,'1','Opt in: creates three retained synthetic orders and restores guarded fixture activation');
const report={project,passed:[],completed:false};
const record='.verification/order-live-results.json';
const passed=message=>{report.passed.push(message);save(record,report);console.log(`PASS ${message}`);};
const old=state('.verification/identity-live-state.json');
const dealers=[old.a,old.b,state('.verification/auth-ui-fixture.json')];
const admin=state('.verification/demo-admin-candidate.json');
let profileRestore=false,organizationRestore=false;
try {
  const target=cli(['projects','list','--output-format','json']).projects.find(p=>p.id===project);
  assert.equal(target.name,'PrepaidDealerPortal');assert.equal(target.status,'ACTIVE_HEALTHY');
  const now=capture();
  assert.equal(now.auth.length,4);assert.equal(now.products.length,12);
  assert.equal(now.roles.filter(r=>r.role==='admin').length,1);
  assert.equal(now.roles.find(r=>r.user_id===admin.id)?.role,'admin');
  for(const account of dealers) {
    assert.equal(now.auth.find(u=>u.id===account.id)?.email,account.email);
    assert.equal(now.roles.find(r=>r.user_id===account.id)?.role,'dealer');
    const p=now.profiles.find(p=>p.id===account.id);assert.equal(p?.is_active,true);assert.equal(p.dealer_id,account.dealerId);
    assert.equal(now.dealers.find(d=>d.id===account.dealerId)?.is_active,true);
  }
  assert.deepEqual(now.history.map(m=>m.version),['20261120000100','20261120000200','20261120000300','20261120000400']);
  const baselinePath='.verification/order-live-before.json';
  if(!exists(baselinePath)) {assert.equal(now.orders.length,0);assert.equal(now.items.length,0);save(baselinePath,now);}
  const before=state(baselinePath);checkPreserved(before,now);
  assert.equal(ok(await request('/auth/v1/settings')).mailer_autoconfirm,true);
  passed('Exact healthy project, four existing controlled accounts, approved migration and unchanged demo Auth setting');

  const suite=readFileSync('supabase/verification/test_atomic_orders.sql','utf8').replace('BEGIN;',`BEGIN;
    SELECT set_config('pdp.order_dealer_a',${literal(dealers[0].id)},true),
    set_config('pdp.order_dealer_b',${literal(dealers[1].id)},true),set_config('pdp.order_admin',${literal(admin.id)},true);`);
  const suitePath='.verification/order-live-rollback.sql';writeFileSync(suitePath,suite,{mode:0o600});
  const result=cli(['db','query',`--remote=${project}`,'--file',suitePath,'--yes']);
  assert.equal(result.rows[0].result,'passed; atomic order fixtures and all edits rolled back');
  assert.deepEqual(capture(),now);
  passed('Hosted rollback suite: success, 24 invalid cases, late-item failure, snapshots/idempotency and 21 denials; complete restoration');

  const tokens=[];for(const account of [...dealers,admin]) tokens.push(await login(account));
  const [a,b,c,adminToken]=tokens;
  const find=sku=>{const p=before.products.find(p=>p.sku===sku&&p.is_active);assert.ok(p);return p;};
  const p=find('PDP-DEMO-CREDIT-005'),q=find('PDP-DEMO-DATA-005');
  const items=[{product_id:p.id,quantity:2},{product_id:q.id,quantity:3}];
  const valid={p_request_id:randomUUID(),p_items:items,p_note:'Synthetic rejected request'};
  denied(await rpc(null,valid));denied(await rpc(adminToken,valid));
  // The OpenAPI root requires a secret key on this gateway. Check actual RPC
  // routes with the public key instead; invalid arguments cannot create rows.
  for(const name of ['validate_order_items','lock_order_dealer','lock_order_products','create_order']) {
    const response=await request(`/rest/v1/rpc/${name}`,a,'POST',
      name==='create_order'?{p_request_id:null,p_items:[],p_note:null}:name==='lock_order_dealer'?{}:{p_items:[]},
      {'Content-Profile':'private'});
    assert.equal(response.status,406);assert.equal(response.body.code,'PGRST106');
    const publicResponse=await request(`/rest/v1/rpc/${name}`,a,'POST',{});
    assert.equal(publicResponse.status,404);assert.equal(publicResponse.body.code,'PGRST202');
  }
  passed('Real anonymous/admin RPC denial; private schema/helpers/entry absent from Data API and public RPC namespace');

  const inactive=before.products.find(p=>!p.is_active);
  const badItems=[null,{},[],[null],[1],[{product_id:p.id}],[{product_id:p.id,quantity:'2'}],
    ...[0,-1,1.5,2147483648,null].map(quantity=>[{product_id:p.id,quantity}]),
    [{product_id:'bad',quantity:1}],[{product_id:null,quantity:1}],
    ...[{unit_price:0},{dealer_id:dealers[1].dealerId},{status:'completed'}].map(extra=>[{product_id:p.id,quantity:1,...extra}]),
    [{product_id:p.id,quantity:1},{product_id:p.id,quantity:2}],
    [{product_id:inactive.id,quantity:1}],[items[0],{product_id:randomUUID(),quantity:1}],
    Array.from({length:101},()=>({product_id:randomUUID(),quantity:1}))];
  for(const bad of badItems) {const response=await rpc(a,{...valid,p_request_id:randomUUID(),p_items:bad});assert.equal(response.status,400);assert.equal(response.body.code,'22023');}
  for(const extra of [{p_request_id:null},{p_note:'x'.repeat(2001)}]) {
    const response=await rpc(a,{...valid,...extra});assert.equal(response.status,400);assert.equal(response.body.code,'22023');
  }
  const forged=await rpc(a,{...valid,p_created_by:dealers[1].id,p_dealer_id:dealers[1].dealerId,p_status:'completed',p_total:0});
  assert.equal(forged.status,404);assert.equal(forged.body.code,'PGRST202');
  assert.deepEqual(capture(),now);
  passed('Real RPC invalid/mixed/archived/duplicate/forged requests rejected with no order/item writes');

  const manifestPath='.verification/order-live-state.json';
  let manifest=exists(manifestPath)?state(manifestPath):null;
  if(!manifest) {
    const shared=randomUUID();
    manifest={project,requests:[
      {p_request_id:shared,p_items:items,p_note:'Synthetic Milestone 6A validation A'},
      {p_request_id:shared,p_items:[{product_id:find('PDP-DEMO-CREDIT-020').id,quantity:1}],p_note:'Synthetic Milestone 6A validation B'},
      {p_request_id:randomUUID(),p_items:[{product_id:find('PDP-DEMO-DATA-002').id,quantity:4}],p_note:'Synthetic Milestone 6A validation C'}],orderIds:[]};
    save(manifestPath,manifest);
  }
  assert.equal(manifest.project,project);
  const responses=await Promise.all([rpc(a,manifest.requests[0]),rpc(a,manifest.requests[0])]);
  const orderA=ok(responses[0]);assert.equal(ok(responses[1]),orderA);
  assert.match(orderA,/^[0-9a-f-]{36}$/);
  manifest.orderIds[0]=orderA;save(manifestPath,manifest);
  assert.equal(ok(await rpc(a,{...manifest.requests[0],p_items:[...manifest.requests[0].p_items].reverse()})),orderA);
  for(const change of [{p_note:'Conflicting note'},{p_items:[{...items[0],quantity:3},items[1]]},{p_items:[items[0]]}]) {
    const response=await rpc(a,{...manifest.requests[0],...change});assert.equal(response.status,409);assert.equal(response.body.code,'23505');
  }
  for(const [index,token] of [[1,b],[2,c]]) {manifest.orderIds[index]=ok(await rpc(token,manifest.requests[index]));save(manifestPath,manifest);}
  assert.equal(new Set(manifest.orderIds).size,3);
  passed('Real concurrent identical HTTP requests and reordered retry return one UUID; conflicts fail; three dealers get isolated orders');

  try {
    profileRestore=true;setFixtureActive(dealers[0],false,false);
    denied(await rpc(a,{...valid,p_request_id:randomUUID()}));denied(await rpc(a,manifest.requests[0]));
    setFixtureActive(dealers[0],false,true);profileRestore=false;
    organizationRestore=true;setFixtureActive(dealers[0],true,false);
    denied(await rpc(a,{...valid,p_request_id:randomUUID()}));denied(await rpc(a,manifest.requests[0]));
    setFixtureActive(dealers[0],true,true);organizationRestore=false;
    assert.equal(ok(await rpc(a,manifest.requests[0])),orderA);
  } finally {
    if(profileRestore) {setFixtureActive(dealers[0],false,true);profileRestore=false;}
    if(organizationRestore) {setFixtureActive(dealers[0],true,true);organizationRestore=false;}
  }
  passed('Same issued JWT denied new submissions/retries for inactive profile and organization; restored statuses recover exact retry');

  denied(await request('/rest/v1/orders?select=id',a));denied(await request('/rest/v1/order_items?select=order_id',a));
  denied(await request('/rest/v1/orders',a,'POST',{dealer_id:dealers[0].dealerId,created_by:dealers[0].id,status:'submitted',request_id:randomUUID()}));
  denied(await request(`/rest/v1/orders?id=eq.${orderA}`,a,'PATCH',{status:'completed'}));
  denied(await request(`/rest/v1/orders?id=eq.${orderA}`,a,'DELETE'));
  denied(await request('/rest/v1/order_items',a,'POST',{order_id:orderA,product_id:p.id,quantity:1,unit_price_snapshot:0,sku_snapshot:p.sku,name_snapshot:p.name}));
  denied(await request(`/rest/v1/order_items?order_id=eq.${orderA}`,a,'PATCH',{quantity:1}));
  denied(await request(`/rest/v1/order_items?order_id=eq.${orderA}`,a,'DELETE'));
  const after=capture();checkPreserved(before,after);
  assert.equal(after.orders.length,before.orders.length+3);assert.equal(after.items.length,before.items.length+4);
  for(const [index,id] of manifest.orderIds.entries()) {
    const order=after.orders.find(o=>o.id===id),intent=manifest.requests[index],account=dealers[index];
    assert.equal(order.created_by,account.id);assert.equal(order.dealer_id,account.dealerId);
    assert.equal(order.status,'submitted');assert.equal(order.request_id,intent.p_request_id);assert.equal(order.note,intent.p_note);
    const lines=after.items.filter(i=>i.order_id===id);assert.equal(lines.length,intent.p_items.length);
    for(const item of intent.p_items) {
      const line=lines.find(i=>i.product_id===item.product_id),product=before.products.find(p=>p.id===item.product_id);
      assert.equal(line.quantity,item.quantity);assert.equal(Number(line.unit_price_snapshot),Number(product.unit_price));
      assert.equal(line.sku_snapshot,product.sku);assert.equal(line.name_snapshot,product.name);
    }
  }
  passed('Authoritative server ownership/status/prices/SKU/name/quantity snapshots verified; only three intended orders/four items added; direct CRUD denied');
  save('.verification/order-live-after.json',after);report.orderIds=manifest.orderIds;report.retainedOrders=3;report.retainedItems=4;
  report.completed=true;save(record,report);
} catch(error) {
  let message=String(error.message);
  for(const account of [...dealers,admin]) for(const value of [account.email,account.password]) {
    if(value) message=message.replaceAll(value,'[redacted]');
  }
  report.failure=message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted token]');
  save(record,report);console.error(`Hosted order verification stopped: ${report.failure}`);process.exitCode=1;
}
finally {if(profileRestore) setFixtureActive(dealers[0],false,true);if(organizationRestore) setFixtureActive(dealers[0],true,true);}
