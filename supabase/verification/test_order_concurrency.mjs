// Real independent PostgreSQL sessions; never connects to a hosted project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asDealer, fixture, submit } from './order_test_support.mjs';

export async function testConcurrency(cluster, owner, products) {
  const connections = [];
  const connect = async () => {
    const db = cluster.getPgClient('postgres','127.0.0.1');
    connections.push(db); await db.connect(); await db.query("SET statement_timeout='10s'"); return db;
  };
  const a = await connect(), b = await connect(), writer = await connect();
  await asDealer(a); await asDealer(b);
  const p = products.find(p=>p.sku==='PDP-DEMO-CREDIT-005');
  const q = products.find(p=>p.sku==='PDP-DEMO-DATA-005');
  const items = [{product_id:p.id,quantity:2},{product_id:q.id,quantity:3}];
  const org=(await owner.query('SELECT dealer_id FROM public.profiles WHERE id=$1',[fixture.a])).rows[0].dealer_id;
  const settle = promise => promise.then(value=>({value}),error=>({error}));
  const waiting = async db => {
    const until=Date.now()+5000;
    while(Date.now()<until) {
      const row=(await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[db.processID])).rows[0];
      if(row?.wait_event_type==='Lock') return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Expected an observed PostgreSQL lock wait');
  };
  const snapshot = async id => (await owner.query('SELECT * FROM public.order_items WHERE order_id=$1 ORDER BY product_id',[id])).rows;
  const restoreProduct = () => owner.query('UPDATE public.products SET sku=$2,name=$3,unit_price=$4,is_active=$5 WHERE id=$1',
    [p.id,p.sku,p.name,p.unit_price,p.is_active]);
  try {
    let key=randomUUID();
    await a.query('BEGIN'); const first=await submit(a,key,items);
    const duplicate=settle(submit(b,key,[items[1],items[0]]));
    await waiting(b); await a.query('COMMIT');
    assert.equal((await duplicate).value,first);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.orders WHERE request_id=$1',[key])).rows[0].n,1);
    console.log('PASS concurrent identical requests wait and return one order UUID');

    key=randomUUID(); await a.query('BEGIN'); await submit(a,key,items);
    const conflict=settle(submit(b,key,[{...items[0],quantity:3},items[1]]));
    await waiting(b); await a.query('COMMIT'); assert.equal((await conflict).error?.code,'23505');
    console.log('PASS concurrent conflicting reuse fails without duplicate order');

    await a.query('BEGIN'); const parallel=await submit(a,randomUUID(),items);
    const independent=await submit(b,randomUUID(),[items[1],items[0]]);
    assert.notEqual(independent,parallel); await a.query('COMMIT');
    console.log('PASS independent requests and reversed item order share product/actor locks without deadlock');

    // A committed writer that acquires its row first must be observed by RPC.
    const writerFirst = async (label,sql,params,code,check) => {
      await writer.query('BEGIN'); await writer.query(sql,params);
      const requestId=randomUUID(); const pending=settle(submit(a,requestId,items));
      await waiting(a); await writer.query('COMMIT'); const result=await pending;
      if(code) {
        assert.equal(result.error?.code,code);
        assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.orders WHERE request_id=$1',[requestId])).rows[0].n,0);
      } else { assert.ok(!result.error); await check(result.value); }
      console.log(`PASS concurrent ${label} committed first is observed after lock wait`);
    };
    await writerFirst('price/SKU/name edit','UPDATE public.products SET unit_price=7.77,sku=$2,name=$3 WHERE id=$1',
      [p.id,'PDP-TEST-6A-RACE','Synthetic race price'],null,async id=>{
        const item=(await snapshot(id)).find(i=>i.product_id===p.id);
        assert.equal(Number(item.unit_price_snapshot),7.77); assert.equal(item.sku_snapshot,'PDP-TEST-6A-RACE');
        assert.equal(item.name_snapshot,'Synthetic race price');
      });
    await restoreProduct();
    await writerFirst('product archival','UPDATE public.products SET is_active=false WHERE id=$1',[p.id],'22023');
    await restoreProduct();
    await writerFirst('profile deactivation','UPDATE public.profiles SET is_active=false WHERE id=$1',[fixture.a],'42501');
    await owner.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[fixture.a]);
    await writerFirst('organization deactivation','UPDATE public.dealers SET is_active=false WHERE id=$1',[org],'42501');
    await owner.query('UPDATE public.dealers SET is_active=true WHERE id=$1',[org]);
    await writerFirst('role revocation',"UPDATE public.user_roles SET role='admin' WHERE user_id=$1",[fixture.a],'42501');
    await owner.query("UPDATE public.user_roles SET role='dealer' WHERE user_id=$1",[fixture.a]);

    const otherOrg=(await owner.query('SELECT dealer_id FROM public.profiles WHERE id=$1',[fixture.b])).rows[0].dealer_id;
    await writerFirst('trusted membership reassignment','UPDATE public.profiles SET dealer_id=$2 WHERE id=$1',
      [fixture.a,otherOrg],null,async id=>{
        assert.equal((await owner.query('SELECT dealer_id FROM public.orders WHERE id=$1',[id])).rows[0].dealer_id,otherOrg);
      });
    await owner.query('UPDATE public.profiles SET dealer_id=$2 WHERE id=$1',[fixture.a,org]);

    // Conversely an RPC holding SHARE locks makes later relevant writes wait.
    const submissionFirst = async (label,sql,params) => {
      await a.query('BEGIN'); const id=await submit(a,randomUUID(),items);
      const pending=settle(writer.query(sql,params)); await waiting(writer);
      await a.query('COMMIT'); assert.ok(!(await pending).error);
      const saved=(await snapshot(id)).find(i=>i.product_id===p.id);
      assert.equal(Number(saved.unit_price_snapshot),5); assert.equal(saved.sku_snapshot,p.sku);
      console.log(`PASS submission locks block later ${label} until transaction end; snapshots retained`);
    };
    await submissionFirst('price edit','UPDATE public.products SET unit_price=8.88 WHERE id=$1',[p.id]); await restoreProduct();
    await submissionFirst('archival','UPDATE public.products SET is_active=false WHERE id=$1',[p.id]); await restoreProduct();
    await submissionFirst('profile deactivation','UPDATE public.profiles SET is_active=false WHERE id=$1',[fixture.a]);
    await owner.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[fixture.a]);
    await submissionFirst('organization deactivation','UPDATE public.dealers SET is_active=false WHERE id=$1',[org]);
    await owner.query('UPDATE public.dealers SET is_active=true WHERE id=$1',[org]);
    await submissionFirst('role edit',"UPDATE public.user_roles SET role='admin' WHERE user_id=$1",[fixture.a]);
    await owner.query("UPDATE public.user_roles SET role='dealer' WHERE user_id=$1",[fixture.a]);
    await submissionFirst('membership reassignment','UPDATE public.profiles SET dealer_id=$2 WHERE id=$1',[fixture.a,otherOrg]);
    await owner.query('UPDATE public.profiles SET dealer_id=$2 WHERE id=$1',[fixture.a,org]);

    key=randomUUID(); await a.query('BEGIN'); const rolledBack=await submit(a,key,items); await a.query('ROLLBACK');
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.orders WHERE id=$1',[rolledBack])).rows[0].n,0);
    const retried=await submit(a,key,items); assert.notEqual(retried,rolledBack);
    console.log('PASS explicit outer rollback removes complete order; same request key can then succeed');
  } finally {
    // Only connections created against this loopback-only disposable cluster.
    for(const db of connections) await owner.query('SELECT pg_cancel_backend($1)',[db.processID]).catch(()=>{});
    for(const db of connections) { await db.query('ROLLBACK').catch(()=>{}); await db.end(); }
  }
}
