import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makePayload, readOrderRequest, requestKey } from '../src/orders/request.js';
import { processOrder } from '../src/orders/submit.js';
import { readDraft, writeDraft, clearDraft, discardDraft, draftKey } from '../src/draft/storage.js';

const owner='00000000-0000-4000-8000-000000006b01',other='00000000-0000-4000-8000-000000006b02';
const product='00000000-0000-4000-8000-000000006b03',order='00000000-0000-4000-8000-000000006b04';
const items=[{productId:product,quantity:2}], selection={items,note:' Synthetic note '};
let saved;
beforeEach(()=>{
  saved=new Map();globalThis.window=new EventTarget();
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  let tail=Promise.resolve();
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_key,fn)=>{
    const next=tail.then(fn);tail=next.catch(()=>{});return next;
  }}});
  writeDraft(owner,items);
});
test('payload sends only canonical IDs/quantities/note/request UUID and rejects invalid selections',()=>{
  const payload=makePayload([{...items[0],price:0,dealer_id:other,status:'completed'}],' note ',order);
  assert.deepEqual(payload,{p_request_id:order,p_items:[{product_id:product,quantity:2}],p_note:'note'});
  assert.throws(()=>makePayload([],''));assert.throws(()=>makePayload([{productId:product,quantity:0}],''));
  assert.throws(()=>makePayload(items,'x'.repeat(2001)));
});
test('ambiguous failure keeps exact request and draft through logout; retry ignores changed UI input',async()=>{
  let sent;
  await assert.rejects(processOrder(owner,selection,async(_owner,payload)=>{
    sent=payload;assert.deepEqual(readOrderRequest(owner).payload,payload);throw new TypeError('fetch failed');
  }));
  assert.deepEqual(readDraft(owner),items);discardDraft(owner);assert.deepEqual(readDraft(owner),items);
  assert.throws(()=>writeDraft(owner,[]),/awaiting confirmation/);assert.throws(()=>clearDraft(owner),/awaiting confirmation/);
  const result=await processOrder(owner,{items:[],note:'changed'},async(user,payload)=>{
    assert.equal(user,owner);assert.deepEqual(payload,sent);return order;
  });
  assert.equal(result.record.orderId,order);assert.deepEqual(readDraft(owner),[]);
  assert.deepEqual(result.record.payload,sent);assert.equal(result.record.draftResolved,true);
});
test('definitive validation rejection unlocks unchanged draft; other errors retain request',async()=>{
  await assert.rejects(processOrder(owner,selection,async()=>{throw {code:'22023'};}));
  assert.equal(readOrderRequest(owner),null);assert.deepEqual(readDraft(owner),items);
  for(const code of ['42501','23505','40001','']) {
    await assert.rejects(processOrder(owner,selection,async()=>{throw {code};}));
    assert.equal(readOrderRequest(owner).status,'pending');assert.deepEqual(readDraft(owner),items);
  }
});
test('two queued submissions share the saved intent and confirmed receipt, making one call',async()=>{
  let release,calls=0;
  const send=async()=>{calls++;await new Promise(resolve=>{release=resolve;});return order;};
  const first=processOrder(owner,selection,send),second=processOrder(owner,selection,send);
  await new Promise(resolve=>setImmediate(resolve));release();
  const results=await Promise.all([first,second]);
  assert.equal(calls,1);assert.equal(results[0].record.orderId,results[1].record.orderId);
});
test('failure to save intent sends nothing; confirmed cleanup failure cannot create another order',async()=>{
  let calls=0;
  const originalSet=localStorage.setItem;
  localStorage.setItem=()=>{throw new Error('quota');};
  await assert.rejects(processOrder(owner,selection,async()=>{calls++;return order;}),/No order was sent/);
  assert.equal(calls,0);localStorage.setItem=originalSet;
  const originalRemove=localStorage.removeItem;
  localStorage.removeItem=key=>{if(key===draftKey(owner))throw new Error('blocked');return originalRemove(key);};
  await assert.rejects(processOrder(owner,selection,async()=>{calls++;return order;}));
  assert.equal(readOrderRequest(owner).status,'confirmed');assert.deepEqual(readDraft(owner),items);
  localStorage.removeItem=originalRemove;
  await processOrder(owner,selection,async()=>{calls++;return order;});
  assert.equal(calls,1);assert.deepEqual(readDraft(owner),[]);
});
test('confirmation persistence failure retains pending UUID for a safe server retry',async()=>{
  const originalSet=localStorage.setItem;let writes=0,first;
  localStorage.setItem=(key,value)=>{if(key===requestKey(owner)&&++writes===2)throw new Error('quota');originalSet(key,value);};
  await assert.rejects(processOrder(owner,selection,async(_owner,payload)=>{first=payload;return order;}));
  assert.equal(readOrderRequest(owner).status,'pending');assert.deepEqual(readDraft(owner),items);
  localStorage.setItem=originalSet;
  await processOrder(owner,selection,async(_owner,payload)=>{assert.deepEqual(payload,first);return order;});
  assert.deepEqual(readDraft(owner),[]);
});
test('owner isolation, corrupt pending record, and changed draft preservation',async()=>{
  writeDraft(other,items);
  await assert.rejects(processOrder(owner,selection,async()=>{throw new Error('lost');}));
  discardDraft(other);assert.deepEqual(readDraft(other),[]);assert.deepEqual(readDraft(owner),items);
  const result=await processOrder(owner,selection,async()=>{
    // Simulate an external edit racing with the saved request, bypassing app guards.
    saved.set(draftKey(owner),JSON.stringify({version:1,items:[{productId:product,quantity:3}]}));return order;
  });
  assert.equal(result.draftKept,true);assert.equal(readDraft(owner)[0].quantity,3);
  saved.set(requestKey(owner),'{broken');assert.throws(()=>readOrderRequest(owner),/unreadable/);
  assert.throws(()=>clearDraft(owner),/unreadable/);
});
