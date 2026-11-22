// Independent LOCAL PostgreSQL sessions. No hosted connection or credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture,asDealer,submit } from './order_test_support.mjs';
import { activate } from './admin_dealer_checks.mjs';

export async function testDealerManagementConcurrency(cluster,owner,products) {
  const clients=[];
  const connect=async()=>{const c=cluster.getPgClient('postgres','127.0.0.1');clients.push(c);await c.connect();await c.query("SET statement_timeout='10s'");return c;};
  const admin=await connect(),dealer=await connect(),writer=await connect();
  await asDealer(admin,fixture.admin);await asDealer(dealer,fixture.a);
  const org=(await owner.query('SELECT dealer_id FROM public.profiles WHERE id=$1',[fixture.a])).rows[0].dealer_id;
  const items=[{product_id:products.find(p=>p.sku==='PDP-DEMO-CREDIT-005').id,quantity:2}];
  const settle=promise=>promise.then(value=>({value}),error=>({error}));
  async function waiting(client) {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      if((await owner.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])).rows[0]?.wait_event_type==='Lock')return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Expected an observed PostgreSQL row-lock wait');
  }
  const organization=active=>admin.query('UPDATE public.dealers SET is_active=$1 WHERE id=$2',[active,org]);
  try {
    for(const [kind,toggle]of [['profile',active=>activate(admin,fixture.a,active)],['organization',organization]]) {
      await dealer.query('BEGIN');const id=await submit(dealer,randomUUID(),items,'Synthetic concurrent 9A order');
      const snapshot=(await owner.query('SELECT * FROM public.order_items WHERE order_id=$1',[id])).rows; // Uncommitted rows are intentionally invisible here.
      assert.deepEqual(snapshot,[]);
      await admin.query('BEGIN');const pending=settle(toggle(false));await waiting(admin);
      await dealer.query('COMMIT');assert.ok((await pending).value);await admin.query('COMMIT');
      assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.order_items WHERE order_id=$1',[id])).rows[0].n,1);
      await assert.rejects(submit(dealer,randomUUID(),items),{code:'42501'});
      await toggle(true);
      console.log(`PASS pending order finishes before admin ${kind} deactivation; committed snapshots remain and later requests fail`);

      await admin.query('BEGIN');await toggle(false);
      const key=randomUUID(),blocked=settle(submit(dealer,key,items));await waiting(dealer);
      await admin.query('COMMIT');assert.equal((await blocked).error?.code,'42501');
      assert.equal((await owner.query('SELECT count(*)::int AS n FROM public.orders WHERE request_id=$1',[key])).rows[0].n,0);
      await toggle(true);
      console.log(`PASS admin ${kind} deactivation committed first blocks a waiting order without partial writes`);
    }
    for(const [change,restore]of [
      ['UPDATE public.profiles SET is_active=false WHERE id=$1','UPDATE public.profiles SET is_active=true WHERE id=$1'],
      ["UPDATE public.user_roles SET role='dealer' WHERE user_id=$1","UPDATE public.user_roles SET role='admin' WHERE user_id=$1"],
    ]) {
      await writer.query('BEGIN');await writer.query(change,[fixture.admin]);
      const pending=settle(activate(admin,fixture.a,false));await waiting(admin);await writer.query('COMMIT');
      assert.equal((await pending).error?.code,'42501');await writer.query(restore,[fixture.admin]);
    }
    assert.equal((await owner.query('SELECT is_active FROM public.profiles WHERE id=$1',[fixture.a])).rows[0].is_active,true);
    console.log('PASS authorization rechecked after waits for concurrent admin profile deactivation or role revocation');

    await writer.query('BEGIN');await writer.query("UPDATE public.user_roles SET role='admin' WHERE user_id=$1",[fixture.a]);
    const invalidTarget=settle(activate(admin,fixture.a,false));await waiting(admin);await writer.query('COMMIT');
    assert.equal((await invalidTarget).error?.code,'22023');
    assert.equal((await owner.query('SELECT is_active FROM public.profiles WHERE id=$1',[fixture.a])).rows[0].is_active,true);
    await writer.query("UPDATE public.user_roles SET role='dealer' WHERE user_id=$1",[fixture.a]);
    console.log('PASS target role rechecked after lock wait; a newly promoted admin cannot be deactivated');

    await admin.query('BEGIN');await activate(admin,fixture.a,false);
    await writer.query('BEGIN');const withdrawal=settle(writer.query('UPDATE public.profiles SET is_active=false WHERE id=$1',[fixture.admin]));
    await waiting(writer);await admin.query('COMMIT');assert.ok((await withdrawal).value);await writer.query('COMMIT');
    await writer.query('UPDATE public.profiles SET is_active=true WHERE id=$1',[fixture.admin]);await activate(admin,fixture.a,true);
    console.log('PASS activation holds the authorized caller profile until commit; all local identity/status fixtures restored');
  } finally {for(const client of clients){await client.query('ROLLBACK').catch(()=>{});await client.end();}}
}
