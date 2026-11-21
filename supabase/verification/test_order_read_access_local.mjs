// Native PostgreSQL 17, loopback-only synthetic fixtures. Never connects remotely.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { setupOrderTests, sqlFile, fixture, asDealer, submit } from './order_test_support.mjs';
import { sorted, visible, checkDenials, checkLiveStatus } from './order_read_checks.mjs';
import { testConcurrency } from './test_order_concurrency.mjs';

const {default:EmbeddedPostgres}=await import(new URL(
  '../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js',import.meta.url));
const root=resolve(import.meta.dirname,'../../.verification');
const databaseDir=mkdtempSync(resolve(root,'history-pg-'));
assert.ok(databaseDir.startsWith(root+'\\history-pg-')||databaseDir.startsWith(root+'/history-pg-'));
const cluster=new EmbeddedPostgres({databaseDir,user:'postgres',password:randomBytes(32).toString('hex'),
  authMethod:'scram-sha-256',port:56437,persistent:true,createPostgresUser:false,
  initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let db,started=false;
const member='00000000-0000-4000-8000-000000007a03';
try {
  await cluster.initialise();await cluster.start();started=true;
  db=cluster.getPgClient('postgres','127.0.0.1');await db.connect();
  await db.query("SET statement_timeout='30s'");
  console.log((await db.query('SELECT version()')).rows[0].version);
  const products=await setupOrderTests(db);
  await db.query(await sqlFile('test_atomic_orders.sql'));
  await db.query(await sqlFile('test_catalog_access.sql'));
  console.log('PASS original 6A atomic/security and 5A catalog SQL regressions before read grants');

  // Additional membership exists only in the disposable Auth event stub.
  await db.query('SET ROLE supabase_auth_admin');
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',
    [member,'history-member@example.invalid',{display_name:'Synthetic same-organization member',business_name:'Local history fixture'}]);
  await db.query('RESET ROLE');
  const org=(await db.query('SELECT dealer_id FROM public.profiles WHERE id=$1',[fixture.a])).rows[0].dealer_id;
  await db.query('UPDATE public.profiles SET dealer_id=$1 WHERE id=$2',[org,member]);
  const profiles=(await db.query('SELECT * FROM public.profiles ORDER BY id')).rows;
  const functions=async()=>sorted((await db.query(`SELECT n.nspname,p.proname,p.prosrc,p.proacl,p.proconfig,p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private')`)).rows);
  const rpcBefore=await functions();
  const p=products.find(p=>p.sku==='PDP-DEMO-CREDIT-005');
  const q=products.find(p=>p.sku==='PDP-DEMO-DATA-005');
  const payload=[{product_id:p.id,quantity:2},{product_id:q.id,quantity:3}],key=randomUUID();
  await asDealer(db);const own=await submit(db,key,payload,'Synthetic history order');
  await asDealer(db,member);const colleague=await submit(db,randomUUID(),[payload[0]]);
  await asDealer(db,fixture.b);const other=await submit(db,randomUUID(),[payload[1]]);
  await db.query('RESET ROLE');
  const orders=(await db.query('SELECT * FROM public.orders')).rows;
  const items=(await db.query('SELECT * FROM public.order_items')).rows;
  await db.query(await sqlFile('../migrations/20261121000500_order_read_access.sql'));
  assert.deepEqual(sorted((await db.query('SELECT * FROM public.orders')).rows),sorted(orders));
  assert.deepEqual(sorted((await db.query('SELECT * FROM public.order_items')).rows),sorted(items));
  assert.deepEqual(await functions(),rpcBefore);
  const orgOrders=orders.filter(o=>o.dealer_id===org),orgItems=items.filter(i=>orgOrders.some(o=>o.id===i.order_id));
  for(const [actor,allowed] of [[fixture.a,[own,colleague]],[member,[own,colleague]],[fixture.b,[other]]]) {
    await asDealer(db,actor);
    await visible(db,orders.filter(o=>allowed.includes(o.id)),items.filter(i=>allowed.includes(i.order_id)));
    for(const id of [own,colleague,other,randomUUID()]) {
      assert.equal((await db.query('SELECT id FROM public.orders WHERE id=$1',[id])).rowCount,Number(allowed.includes(id)));
      assert.deepEqual(sorted((await db.query('SELECT * FROM public.order_items WHERE order_id=$1',[id])).rows),
        sorted(items.filter(i=>i.order_id===id&&allowed.includes(id))));
    }
    assert.equal((await db.query('SELECT id FROM public.profiles WHERE id<>$1',[actor])).rowCount,0);
    assert.ok((await db.query('SELECT order_id FROM public.order_items WHERE product_id=$1',[p.id])).rows.every(i=>allowed.includes(i.order_id)));
  }
  console.log('PASS same-organization colleagues; cross-organization/guessed UUIDs; item/product-ID filters and joins; private profiles; no recursive RLS');
  for(const actor of [fixture.admin,randomUUID(),'']) {await asDealer(db,actor);await visible(db,[],[]);}
  await checkLiveStatus(db,member,org,orgOrders,orgItems);
  await checkDenials(db,org);
  console.log('PASS admin/missing identity and same-claims profile/organization/role/membership restrictions; client writes and RLS write defense');

  // History is independent of the current catalog and order status.
  await db.query('RESET ROLE');
  await db.query("UPDATE public.products SET sku='PDP-TEST-7A-ARCHIVED',name='Changed local product',unit_price=99.99,is_active=false WHERE id=$1",[p.id]);
  await asDealer(db);assert.equal((await db.query('SELECT id FROM public.products WHERE id=$1',[p.id])).rowCount,0);
  await visible(db,orgOrders,orgItems);
  assert.equal(await submit(db,key,payload,'Synthetic history order'),own);
  await db.query('RESET ROLE');
  await db.query('UPDATE public.products SET sku=$2,name=$3,unit_price=$4,is_active=$5 WHERE id=$1',[p.id,p.sku,p.name,p.unit_price,p.is_active]);
  for(const status of ['processing','completed','rejected']) {
    await db.query('UPDATE public.orders SET status=$1 WHERE id=$2',[status,own]);
    await asDealer(db);assert.equal((await db.query('SELECT status FROM public.orders WHERE id=$1',[own])).rows[0].status,status);
    await db.query('RESET ROLE');
  }
  await db.query("UPDATE public.orders SET status='submitted' WHERE id=$1",[own]);
  await asDealer(db);
  const nextKey=randomUUID(),next=await submit(db,nextKey,payload);
  assert.equal(await submit(db,nextKey,[payload[1],payload[0]]),next);
  await assert.rejects(submit(db,nextKey,payload,'conflict'),{code:'23505'});
  await assert.rejects(submit(db,randomUUID(),[payload[0],{product_id:randomUUID(),quantity:1}]),{code:'22023'});
  await db.query('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,4);
  console.log('PASS historical snapshots after archival/rename/repricing; all statuses; unchanged RPC replay/conflicts and invalid request rollback after migration');

  await testConcurrency(cluster,db,products);
  assert.deepEqual(await functions(),rpcBefore);
  assert.deepEqual((await db.query('SELECT * FROM public.products ORDER BY sku')).rows,products);
  assert.deepEqual((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows,profiles);
  const security=(await db.query(`SELECT c.relname,c.relrowsecurity,
    has_table_privilege('authenticated',c.oid,'SELECT') AS can_read,
    has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') AS any_write
    FROM pg_class c WHERE c.oid IN ('public.orders'::regclass,'public.order_items'::regclass)`)).rows;
  assert.ok(security.every(t=>t.relrowsecurity&&t.can_read&&!t.anon_read&&!t.any_write));
  console.log('PASS post-migration native concurrency; unchanged products/profiles/RPC functions and grants; SELECT-only order privileges');
} finally {await db?.end();if(started)await cluster.stop();}
