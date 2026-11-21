import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';

test.skip(process.env.PDP_HISTORY_UI_LIVE!=='1','Opt in: existing controlled sessions, read-only history and browser mocks; no hosted fixture writes.');
const state=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const baseline=()=>state('.verification/history-ui-before.json').data;
const accounts=()=>state('.verification/identity-live-state.json');
const owned=user=>baseline().orders.filter(o=>o.dealer_id===user.dealerId).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||b.id.localeCompare(a.id));
const lines=id=>baseline().items.filter(i=>i.order_id===id);
const total=id=>state('.verification/history-ui-totals.json').find(t=>t.order_id===id);
const euros=value=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(Number(value));
const details=id=>`/order-details/?id=${id}`;
const api='**/rest/v1/orders?**';
const env=loadEnv('production',process.cwd(),'VITE_');
const card=(page,id)=>page.locator(`#order-list [data-order-id="${id}"]`);
const apiRow=order=>({...order,created_at:new Date(order.created_at).toISOString(),order_items:lines(order.id)});
let errors,forbidden,orderRequests;
test.beforeEach(async({page})=>{
  errors=[];forbidden=[];orderRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    if(r.url().includes('/rest/v1/orders?'))orderRequests++;
    if(/\/rest\/v1\//.test(r.url())&&r.method()!=='GET')forbidden.push(r.method());
    if(/\/storage\/v1|\/auth\/v1\/admin/.test(r.url()))forbidden.push('out-of-scope');
    if(r.url().includes('/rest/v1/products?')&&['/my-orders/','/order-details/'].includes(new URL(r.frame().url()).pathname))forbidden.push('catalog lookup in history');
  });
});
test.afterEach(()=>{expect(errors).toEqual([]);expect(forbidden).toEqual([]);});
async function login(page,user,admin=false) {
  await page.goto('/login/');await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(admin?/\/admin\//:/\/catalog\//);
  await expect(page.locator('#protected-content')).toBeVisible();
  if(!admin)await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
}
async function verifyDetails(page,order) {
  await expect(page.locator('#order-content')).toBeVisible();
  await expect(page.locator('#order-reference')).toHaveText(order.id);
  await expect(page.locator('#order-total')).toHaveText(euros(total(order.id).total));
  await expect(page.locator('#saved-count')).toHaveText(String(total(order.id).item_count));
  await expect(page.locator('#saved-units')).toHaveText(String(total(order.id).units));
  await expect(page.locator('#saved-status')).toHaveText(order.status[0].toUpperCase()+order.status.slice(1));
  await expect(page.locator('#saved-date time')).toHaveAttribute('datetime',new Date(order.created_at).toISOString());
  await expect(page.locator('#saved-note')).toHaveText(order.note?.trim()||'No note included.');
  await expect(page.locator('#saved-items [data-product-id]')).toHaveCount(lines(order.id).length);
  for(const item of lines(order.id)) {
    const row=page.locator(`#saved-items [data-product-id="${item.product_id}"]`);
    await expect(row.getByRole('heading')).toHaveText(item.name_snapshot);await expect(row.locator('.product-sku')).toHaveText(`SKU: ${item.sku_snapshot}`);
    await expect(row.locator('[data-quantity]')).toHaveText(String(item.quantity));
    await expect(row.locator('[data-price]')).toHaveText(euros(item.unit_price_snapshot));
    await expect(row.locator('.line-total')).toHaveText(euros(Number(item.unit_price_snapshot)*item.quantity));
  }
}
async function directRead(page,path) {
  return page.evaluate(async({path,url,key})=>{
    const entry=Object.entries(localStorage).find(([k])=>k.startsWith('sb-')&&k.endsWith('-auth-token'));
    const session=JSON.parse(entry[1]);const r=await fetch(url+path,{headers:{apikey:key,Authorization:`Bearer ${session.access_token}`}});
    return{status:r.status,rows:await r.json()};
  },{path,url:env.VITE_SUPABASE_URL,key:env.VITE_SUPABASE_PUBLISHABLE_KEY});
}

test('real dealer history, saved details, direct URLs, refresh and cross-organization isolation',async({page})=>{
  const {a,b}=accounts(),orders=owned(a);
  for(const path of ['/my-orders/',details(orders[0].id)]){await page.goto(path);await expect(page).toHaveURL(/\/login\//);}
  await login(page,a);await page.goto('/my-orders/');
  await expect(page.locator('#order-list [data-order-id]')).toHaveCount(orders.length);
  expect(await page.locator('#order-list [data-order-id]').evaluateAll(rows=>rows.map(r=>r.dataset.orderId))).toEqual(orders.map(o=>o.id));
  for(const order of orders) {
    await expect(card(page,order.id).locator('.order-total')).toHaveText(euros(total(order.id).total));
    await expect(card(page,order.id).locator('[data-count]')).toContainText(`${total(order.id).item_count} product`);
    await card(page,order.id).getByRole('link').click();await verifyDetails(page,order);
    await page.reload();await verifyDetails(page,order);await page.getByRole('link',{name:'Back to my orders',exact:true}).click();
    await expect(page.locator('#order-list [data-order-id]')).toHaveCount(orders.length);
  }
  await page.screenshot({path:'.verification/history-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);
  await login(page,b);await page.goto('/my-orders/');await expect(page.locator('#order-list [data-order-id]')).toHaveCount(owned(b).length);
  for(const order of orders) {
    await expect(card(page,order.id)).toHaveCount(0);await page.goto(details(order.id));
    await expect(page.locator('#details-state')).toContainText('Order unavailable');await expect(page.locator('#order-content')).toBeHidden();
    expect(await directRead(page,`/rest/v1/orders?select=id&id=eq.${order.id}`)).toEqual({status:200,rows:[]});
    expect(await directRead(page,`/rest/v1/order_items?select=order_id&order_id=eq.${order.id}`)).toEqual({status:200,rows:[]});
  }
  const visible=await directRead(page,'/rest/v1/orders?select=id');expect(visible.status).toBe(200);
  expect(visible.rows.map(r=>r.id).sort()).toEqual(owned(b).map(o=>o.id).sort());
  await page.goto(details(owned(b)[0].id));await verifyDetails(page,owned(b)[0]);
});

test('loading, empty, invalid links, unavailable UUIDs, API errors and retry clear stale content',async({page})=>{
  const a=accounts().a,order=owned(a)[0];await login(page,a);
  await page.route(api,async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,600));await route.fulfill({response});});
  await page.goto('/my-orders/');await expect(page.locator('#history-state')).toContainText('Loading');
  await expect(page.locator('#order-list [data-order-id]')).toHaveCount(owned(a).length);await page.unroute(api);
  await page.route(api,route=>route.fulfill({json:[]}));await page.getByRole('button',{name:'Refresh orders'}).click();
  await expect(page.locator('#empty-history')).toBeVisible();await expect(page.locator('#order-list [data-order-id]')).toHaveCount(0);await page.unroute(api);
  await page.route(api,route=>route.fulfill({status:503,json:{code:'PGRST000',message:'Synthetic unavailable'}}));await page.getByRole('button',{name:'Refresh orders'}).click();
  await expect(page.locator('#history-state')).toContainText('Could not load');await expect(page.locator('#empty-history')).toBeHidden();await page.unroute(api);
  await page.getByRole('button',{name:'Retry orders',exact:true}).click();await expect(page.locator('#order-list [data-order-id]')).toHaveCount(owned(a).length);
  for(const path of ['/order-details/','/order-details/?id=bad',`${details(order.id)}&id=${order.id}`]) {
    const before=orderRequests;await page.goto(path);await expect(page.locator('#details-state')).toContainText('Invalid order link');expect(orderRequests).toBe(before);
  }
  await page.goto(details('00000000-0000-4000-8000-000000007bff'));await expect(page.locator('#details-state')).toContainText('Order unavailable');
  await page.route(api,route=>route.fulfill({status:403,json:{code:'42501',message:'Synthetic denied'}}));await page.goto(details(order.id));
  await expect(page.locator('#details-state')).toContainText('access was denied');await expect(page.locator('#order-content')).toBeHidden();await page.unroute(api);
  await page.getByRole('button',{name:'Retry order',exact:true}).click();await verifyDetails(page,order);
  await page.route(api,route=>route.fulfill({status:401,json:{code:'PGRST301',message:'Synthetic expired session'}}));await page.reload();
  await expect(page.locator('#details-state')).toContainText('access was denied');await page.unroute(api);
  await page.route(api,route=>route.abort());await page.reload();await expect(page.locator('#details-state')).toContainText('Could not load');
  await expect(page.locator('#saved-items [data-product-id]')).toHaveCount(0);await page.unroute(api);
  await page.getByRole('button',{name:'Retry order',exact:true}).click();await verifyDetails(page,order);
  await page.route(api,route=>route.fulfill({json:[{...apiRow(order),order_items:[]}]}));await page.reload();
  await expect(page.locator('#details-state')).toContainText('Could not load');await expect(page.locator('#order-content')).toBeHidden();
});

test('pagination, saved snapshot rendering, safe text and responsive mobile layouts',async({page})=>{
  const a=accounts().a,order=owned(a)[0];await login(page,a);
  const mocked=Array.from({length:21},(_,i)=>({...apiRow(order),id:`00000000-0000-4000-8000-000000007b${i.toString(16).padStart(2,'0')}`,
    status:['submitted','processing','completed','rejected'][i%4],created_at:new Date(Date.parse(order.created_at)-i*1000).toISOString()}));
  await page.route(api,route=>{const offset=Number(new URL(route.request().url()).searchParams.get('offset')??0);return route.fulfill({json:mocked.slice(offset,offset+21)});});
  await page.goto('/my-orders/');await expect(page.locator('#order-list [data-order-id]')).toHaveCount(20);
  await expect(page.getByRole('button',{name:'Previous orders'})).toBeDisabled();await page.getByRole('button',{name:'Next orders'}).click();
  await expect(page.locator('#history-page')).toHaveText('Page 2');await expect(card(page,mocked[20].id)).toBeVisible();
  await expect(page.getByRole('button',{name:'Next orders'})).toBeDisabled();await page.getByRole('button',{name:'Previous orders'}).click();
  await expect(page.locator('#order-list [data-order-id]')).toHaveCount(20);await page.unroute(api);
  await page.getByRole('button',{name:'Refresh orders'}).click();await expect(page.locator('#order-list [data-order-id]')).toHaveCount(owned(a).length);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.locator('#main-content').focus();await page.screenshot({path:'.verification/history-mobile.png',fullPage:true});
  const markup='<img src=x onerror="window.historyXss=1">';
  await page.route(api,route=>route.fulfill({json:[{...apiRow(order),note:markup,order_items:[{...lines(order.id)[0],
    name_snapshot:markup,sku_snapshot:'SAVED-OLD-SKU',unit_price_snapshot:'0.10',quantity:3}]}]}));
  await page.goto(details(order.id));await expect(page.locator('#order-total')).toHaveText('€0.30');
  await expect(page.locator('#saved-items h3')).toHaveText(markup);await expect(page.locator('#saved-note')).toHaveText(markup);
  expect(await page.evaluate(()=>window.historyXss??null)).toBeNull();await expect(page.locator('#order-content img')).toHaveCount(0);
  await page.unroute(api);
  await page.route(api,route=>route.fulfill({json:[{...apiRow(order),order_items:[{...lines(order.id)[0],quantity:2147483647,unit_price_snapshot:'9999999999.99'}]}]}));
  await page.reload();await expect(page.locator('#order-total')).toHaveText('€21,474,836,469,978,525,163.53');
  await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.unroute(api);await page.reload();await verifyDetails(page,order);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.verification/order-details-mobile.png',fullPage:true});
});

test('inactive and admin guards block history and details without loading order data',async({page})=>{
  const a=accounts().a;await login(page,a);
  await page.route('**/rest/v1/profiles?**',async route=>{const response=await route.fetch();const rows=await response.json();await route.fulfill({response,json:rows.map(p=>({...p,is_active:false}))});});
  for(const path of ['/my-orders/',details(owned(a)[0].id)]) {
    const before=orderRequests;await page.goto(path);await expect(page.locator('#account-status')).toContainText('Your account is inactive');
    await expect(page.locator('#protected-content')).toBeHidden();expect(orderRequests).toBe(before);
  }
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);await page.unroute('**/rest/v1/profiles?**');
  await login(page,state('.verification/demo-admin-candidate.json'),true);
  for(const path of ['/my-orders/',details(owned(a)[0].id)]) {
    const before=orderRequests;await page.goto(path);await expect(page).toHaveURL(/\/admin\//);expect(orderRequests).toBe(before);
  }
  expect(await directRead(page,'/rest/v1/orders?select=id')).toEqual({status:200,rows:[]});
});
