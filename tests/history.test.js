import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedOrder, savedCents, savedEuros, orderIdFromSearch, orderPath } from '../src/orders/history-model.js';

const id='00000000-0000-4000-8000-000000007b01',org='00000000-0000-4000-8000-000000007b02';
const product='00000000-0000-4000-8000-000000007b03';
const row=()=>({id,dealer_id:org,status:'submitted',created_at:'2026-11-20T12:00:00+00:00',note:'Saved note',
  order_items:[{product_id:product,quantity:3,unit_price_snapshot:'0.10',sku_snapshot:'OLD-SKU',name_snapshot:'Saved name'}]});

test('order links accept one UUID only and cannot construct arbitrary paths or query text',()=>{
  assert.equal(orderIdFromSearch(`?id=${id.toUpperCase()}`),id);
  for(const query of ['', '?id=', '?id=demo', `?id=${id}&id=${id}`, '?id=%3Cscript%3E'])assert.equal(orderIdFromSearch(query),null);
  assert.equal(orderPath(id),`/order-details/?id=${id}`);assert.throws(()=>orderPath('javascript:alert(1)'));
});
test('saved items determine totals and names independently of current products or draft bounds',()=>{
  const raw=row();Object.assign(raw.order_items[0],{unit_price:0,name:'Current name',is_active:false,quantity:1000});
  for(const status of ['submitted','processing','completed','rejected']) {
    raw.status=status;const order=savedOrder(raw,org);
    assert.equal(order.totalCents,10000n);assert.equal(order.items[0].name,'Saved name');assert.equal(order.items[0].sku,'OLD-SKU');
    assert.equal(order.itemCount,1);assert.equal(order.units,1000);assert.equal(savedEuros(order.totalCents),'€100.00');
  }
});
test('historical EUR arithmetic and formatting stay exact above Number safe integer limits',()=>{
  assert.equal(savedEuros(savedOrder(row(),org).totalCents),'€0.30');
  const raw=row();raw.order_items[0].quantity=2147483647;raw.order_items[0].unit_price_snapshot='9999999999.99';
  assert.equal(savedEuros(savedOrder(raw,org).totalCents),'€21,474,836,469,978,525,163.53');
  assert.equal(savedEuros(900719925474099301n),'€9,007,199,254,740,993.01');
  assert.equal(savedEuros(savedCents(0)),'€0.00');
  for(const price of [-1,NaN,Infinity,'0.001','1e2','10000000000'])assert.throws(()=>savedCents(price));
});
test('untrusted or incomplete responses fail instead of displaying misleading history totals',()=>{
  for(const change of [{dealer_id:product},{id:'bad'},{status:'toString'},{created_at:'bad'},{note:42},{order_items:[]},{order_items:null}])
    assert.throws(()=>savedOrder({...row(),...change},org));
  for(const change of [{quantity:0},{quantity:-1},{quantity:1.5},{quantity:'3'},{quantity:2147483648},{product_id:'bad'},
    {unit_price_snapshot:'NaN'},{name_snapshot:''},{sku_snapshot:null}]) {
    const raw=row();Object.assign(raw.order_items[0],change);assert.throws(()=>savedOrder(raw,org));
  }
  const raw=row();raw.order_items.push({...raw.order_items[0],product_id:product.toUpperCase()});assert.throws(()=>savedOrder(raw,org));
});
