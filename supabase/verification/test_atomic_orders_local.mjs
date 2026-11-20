// Native PostgreSQL 17 test cluster, loopback-only and disposable synthetic data.
// Does not read Supabase credentials or accept a remote/database URL.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { setupOrderTests, sqlFile } from './order_test_support.mjs';
import { testConcurrency } from './test_order_concurrency.mjs';

const { default: EmbeddedPostgres } = await import(new URL(
  '../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js',import.meta.url));
const root=resolve(import.meta.dirname,'../../.verification');
const databaseDir=mkdtempSync(resolve(root,'order-pg-'));
assert.ok(databaseDir.startsWith(root+ '/order-pg-') || databaseDir.startsWith(root+'\\order-pg-'));
const cluster=new EmbeddedPostgres({databaseDir,user:'postgres',password:randomBytes(32).toString('hex'),
  authMethod:'scram-sha-256',port:56436,persistent:true,createPostgresUser:false,
  initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let started=false,db;
try {
  await cluster.initialise(); await cluster.start(); started=true;
  db=cluster.getPgClient('postgres','127.0.0.1'); await db.connect();
  console.log((await db.query('SELECT version()')).rows[0].version);
  const products=await setupOrderTests(db);
  const before=(await db.query('SELECT * FROM public.profiles ORDER BY id')).rows;
  const result=await db.query(await sqlFile('test_atomic_orders.sql'));
  assert.equal(result.at(-1).rows[0].result,'passed; atomic order fixtures and all edits rolled back');
  assert.deepEqual((await db.query('SELECT * FROM public.products ORDER BY sku')).rows,products);
  assert.deepEqual((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.orders')).rows[0].n,0);
  console.log('PASS native atomic/security suite: success, 24 invalid cases, late rollback, snapshots, idempotency, 21 authorization/helper/table denials');
  await db.query(await sqlFile('test_catalog_access.sql'));
  console.log('PASS existing 5A catalog/status/permission regression suite unchanged');
  await testConcurrency(cluster,db,products);
  assert.deepEqual((await db.query('SELECT * FROM public.products ORDER BY sku')).rows,products);
  assert.deepEqual((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows,before);
  const security=(await db.query(`SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
    pg_get_userbyid(p.proowner) AS owner,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname IN ('validate_order_items','lock_order_dealer','lock_order_products','create_order','submit_order')`)).rows;
  assert.equal(security.length,5);
  for(const f of security) {
    assert.equal(f.owner,'postgres'); assert.equal(f.anon_exec,false);
    assert.deepEqual(f.proconfig,['search_path=""']);
    assert.equal(f.prosecdef,f.proname==='create_order');
    assert.equal(f.auth_exec,['create_order','submit_order'].includes(f.proname));
  }
  console.log('PASS function ownership/search paths/grants, invoker wrapper and owner-only helpers; no original product/profile drift');
} finally { await db?.end(); if(started) await cluster.stop(); }
