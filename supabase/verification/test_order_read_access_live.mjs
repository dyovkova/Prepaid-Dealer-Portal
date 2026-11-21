// Public Auth login and GET-only Data API checks. Trusted SQL is read-only.
// --baseline verifies pre-deployment denials; default requires 7A already applied.
import assert from 'node:assert/strict';
import { project,cli,capture,state,save,login,request,ok,denied } from './order_live_support.mjs';

assert.equal(process.env.PDP_HISTORY_LIVE_TESTS,'1','Opt in with PDP_HISTORY_LIVE_TESTS=1; existing controlled logins only');
const baseline=process.argv.includes('--baseline');
const report={project,mode:baseline?'pre-deployment baseline':'deployed 7A',passed:[],completed:false};
let stage='project/history';
const check=label=>{stage=label;};
const pass=label=>{report.passed.push(label);console.log(`PASS ${label}`);};
// JSON object key order can differ in PostgREST embeds; compare stable row IDs.
const rowKey=row=>row.id??`${row.order_id}:${row.product_id}`;
const sort=rows=>[...rows].sort((a,b)=>rowKey(a).localeCompare(rowKey(b)));
const orderColumns='id,dealer_id,created_by,status,note,request_id';
const itemColumns='order_id,product_id,quantity,unit_price_snapshot,sku_snapshot,name_snapshot';
const pick=(row,columns)=>Object.fromEntries(columns.split(',').map(k=>[k,k==='unit_price_snapshot'?Number(row[k]):row[k]]));
const rows=async(path,token,expected)=>assert.deepEqual(sort(ok(await request(path,token))),sort(expected));
try {
  const target=cli(['projects','list','--output-format','json']).projects.find(p=>p.id===project);
  assert.equal(target?.name,'PrepaidDealerPortal');assert.equal(target.status,'ACTIVE_HEALTHY');
  const history=cli(['migration','list',`--remote=${project}`]);
  assert.equal(history.target.project_ref,project);
  assert.deepEqual(history.migrations.map(m=>[m.local,m.remote]),[
    ...['20261120000100','20261120000200','20261120000300','20261120000400'].map(v=>[v,v]),
    ['20261121000500',baseline?'':'20261121000500'],
  ]);
  const before=capture();
  const {a,b}=state('.verification/identity-live-state.json');
  const dealers=[a,b,state('.verification/auth-ui-fixture.json')];
  const admin=state('.verification/demo-admin-candidate.json');
  check('controlled account identities and active organizations');
  for(const account of [...dealers,admin]) {
    assert.equal(before.auth.find(u=>u.id===account.id)?.email,account.email);
    const profile=before.profiles.find(p=>p.id===account.id);
    assert.equal(profile?.is_active,true);
    assert.equal(before.roles.find(r=>r.user_id===account.id)?.role,account===admin?'admin':'dealer');
    if(account!==admin) {
      assert.equal(profile.dealer_id,account.dealerId);
      assert.equal(before.dealers.find(d=>d.id===account.dealerId)?.is_active,true);
      assert.ok(before.orders.some(o=>o.dealer_id===account.dealerId),'Each dealer needs an existing order');
    }
  }
  assert.equal(new Set(dealers.map(d=>d.dealerId)).size,3,'Existing fixtures remain isolated; do not reassign membership');
  const tokens=[];
  for(const account of [...dealers,admin])tokens.push(await login(account));
  pass('public Auth login verified three existing dealers and the permanent admin');
  for(const [index,account]of [...dealers,admin].entries()) {
    check(`account ${index+1} lists, UUID lookups and nested relationships`);
    const token=tokens[index],allowed=account===admin?[]:before.orders.filter(o=>o.dealer_id===account.dealerId);
    const items=before.items.filter(i=>allowed.some(o=>o.id===i.order_id));
    for(const [table,columns,expected]of [['orders',orderColumns,allowed],['order_items',itemColumns,items]]) {
      const path=`/rest/v1/${table}?select=${columns}`;
      if(baseline)denied(await request(path,token));else await rows(path,token,expected.map(r=>pick(r,columns)));
    }
    for(const order of before.orders) {
      const own=allowed.some(o=>o.id===order.id);
      const lookups=[
        [`/rest/v1/orders?select=${orderColumns}&id=eq.${order.id}`,own?[pick(order,orderColumns)]:[]],
        [`/rest/v1/order_items?select=${itemColumns}&order_id=eq.${order.id}`,own?before.items.filter(i=>i.order_id===order.id).map(i=>pick(i,itemColumns)):[]],
      ];
      for(const [path,expected]of lookups) {
        if(baseline)denied(await request(path,token));else await rows(path,token,expected);
      }
    }
    if(!baseline) {
      await rows(`/rest/v1/orders?select=id&id=eq.00000000-0000-4000-8000-000000007aff`,token,[]);
      const nested=ok(await request(`/rest/v1/orders?select=id,order_items(${itemColumns})`,token));
      assert.deepEqual(sort(nested.map(o=>({id:o.id,order_items:sort(o.order_items)}))),
        sort(allowed.map(o=>({id:o.id,order_items:sort(items.filter(i=>i.order_id===o.id).map(i=>pick(i,itemColumns)))}))));
      await rows(`/rest/v1/order_items?select=${itemColumns},orders!inner(id,dealer_id)`,token,
        items.map(i=>({...pick(i,itemColumns),orders:pick(allowed.find(o=>o.id===i.order_id),'id,dealer_id')})));
      for(const productId of new Set(before.items.map(i=>i.product_id)))
        await rows(`/rest/v1/order_items?select=${itemColumns}&product_id=eq.${productId}`,token,
          items.filter(i=>i.product_id===productId).map(i=>pick(i,itemColumns)));
    }
  }
  pass(baseline?'real dealer/admin lists and every existing order/item UUID remain denied before approval'
    :'real dealer organization lists, direct own/cross UUIDs, snapshots, product filters, nested joins and admin denial');
  check('anonymous access');
  for(const table of ['orders','order_items'])denied(await request(`/rest/v1/${table}?select=*`,null));
  pass('anonymous reads denied');
  check('preservation');
  assert.deepEqual(capture(),before);
  report.counts={orders:before.orders.length,items:before.items.length};
  report.completed=true;pass('all original identities, products, orders/items, policies and migration history preserved');
} catch(error) {
  // Never log session bodies, fixture credentials or raw assertions with account data.
  report.failure=stage;console.error(`FAIL hosted history check: ${stage}`);process.exitCode=1;
} finally {save(`.verification/order-history-${baseline?'baseline':'live'}-report.json`,report);}
