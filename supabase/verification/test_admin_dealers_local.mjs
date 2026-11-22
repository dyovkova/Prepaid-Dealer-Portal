// Native disposable PostgreSQL 17, loopback only. No hosted credentials/writes.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import { setupOrderTests,sqlFile,fixture,asDealer,submit } from './order_test_support.mjs';
import { testAdminProducts } from './admin_product_checks.mjs';
import { member,testAdminDealers } from './admin_dealer_checks.mjs';
import { testConcurrency } from './test_order_concurrency.mjs';
import { testDealerManagementConcurrency } from './admin_dealer_concurrency.mjs';

const {default:EmbeddedPostgres}=await import(new URL('../../.verification/order-sql-tools/node_modules/embedded-postgres/dist/index.js',import.meta.url));
const root=resolve(import.meta.dirname,'../../.verification'),databaseDir=mkdtempSync(resolve(root,'admin-dealers-pg-'));
assert.equal(resolve(databaseDir,'..'),root);
const cluster=new EmbeddedPostgres({databaseDir,user:'postgres',password:randomBytes(32).toString('hex'),authMethod:'scram-sha-256',port:56439,persistent:true,createPostgresUser:false,
 initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let db,started=false;
const rows=async sql=>(await db.query(sql)).rows;
const snapshot=async()=>({
 auth:await rows('SELECT * FROM auth.users ORDER BY id'),profiles:await rows('SELECT * FROM public.profiles ORDER BY id'),roles:await rows('SELECT * FROM public.user_roles ORDER BY user_id'),
 dealers:await rows('SELECT * FROM public.dealers ORDER BY id'),products:await rows('SELECT * FROM public.products ORDER BY id'),orders:await rows('SELECT * FROM public.orders ORDER BY id'),items:await rows('SELECT * FROM public.order_items ORDER BY order_id,product_id'),
 functions:await rows("SELECT n.nspname,p.proname,p.prosrc,p.proacl,p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') ORDER BY n.nspname,p.proname"),
 policies:await rows("SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"),
});
try {
 await cluster.initialise();await cluster.start();started=true;
 db=cluster.getPgClient('postgres','127.0.0.1');await db.connect();await db.query("SET statement_timeout='15s'");
 console.log((await rows('SELECT version()'))[0].version);
 const products=await setupOrderTests(db);
 await db.query(await sqlFile('test_catalog_access.sql'));await db.query(await sqlFile('test_atomic_orders.sql'));
 await db.query(await sqlFile('../migrations/20261121000500_order_read_access.sql'));
 await db.query(await sqlFile('../migrations/20261121000600_admin_product_access.sql'));
 await testAdminProducts(db,products);
 await db.query('SET ROLE supabase_auth_admin');
 await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3)',[member,'colleague@example.invalid',{display_name:'Synthetic colleague',business_name:'Synthetic colleague organization'}]);
 await db.query('RESET ROLE');
 await db.query('UPDATE public.profiles SET dealer_id=(SELECT dealer_id FROM public.profiles WHERE id=$1) WHERE id=$2',[fixture.a,member]);
 for(const actor of [fixture.a,member,fixture.b]){await asDealer(db,actor);await submit(db,randomUUID(),[{product_id:products[0].id,quantity:2}],'Synthetic pre-9A order');}
 await db.query('RESET ROLE');const before=await snapshot();
 await db.query(await sqlFile('../migrations/20261121000700_admin_dealer_access.sql'));
 const migrated=await snapshot();
 for(const key of ['auth','profiles','roles','dealers','products','orders','items'])assert.deepEqual(migrated[key],before[key]);
 assert.deepEqual(migrated.functions.filter(f=>f.proname!=='set_dealer_profile_active'),before.functions);
 await testAdminDealers(db,before,products);
 const after=await snapshot();for(const key of Object.keys(migrated))assert.deepEqual(after[key],migrated[key]);
 const functions=await rows(`SELECT n.nspname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='set_dealer_profile_active' ORDER BY n.nspname`);
 assert.equal(functions.length,2);for(const f of functions){assert.equal(f.owner,'postgres');assert.deepEqual(f.proconfig,['search_path=""']);assert.equal(f.anon,false);assert.equal(f.authenticated,true);assert.equal(f.prosecdef,f.nspname==='private');}
 const protectedColumns=await rows(`SELECT has_column_privilege('authenticated','public.profiles','is_active','UPDATE') AS active,
 has_column_privilege('authenticated','public.profiles','dealer_id','UPDATE') AS membership,
 has_table_privilege('authenticated','public.user_roles','INSERT,UPDATE,DELETE,TRUNCATE') AS roles,
 has_table_privilege('authenticated','public.dealers','INSERT,UPDATE,DELETE,TRUNCATE') AS table_writes`);
 assert.ok(Object.values(protectedColumns[0]).every(v=>v===false));
 console.log('PASS all seven migrations; unchanged existing rows/functions and exact fixture rollback; private definer/public invoker ACLs/search paths and protected columns');
 await testDealerManagementConcurrency(cluster,db,products);
 for(const [table,key,order]of [['profiles','profiles','id'],['user_roles','roles','user_id'],['dealers','dealers','id']])
   assert.deepEqual(await rows(`SELECT * FROM public.${table} ORDER BY ${order}`),before[key]);
 await testConcurrency(cluster,db,products);
 console.log('PASS existing atomic/catalog/admin-product security and post-9A native order concurrency regressions');
} finally {await db?.end();if(started)await cluster.stop();}
