import { test, expect } from '@playwright/test';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { draftKey } from '../src/draft/storage.js';
import { requestKey } from '../src/orders/request.js';

test.skip(process.env.PDP_SUBMISSION_UI_LIVE!=='1','Opt in: existing real accounts; two retained synthetic orders; no trusted writes.');
const state=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const accounts=()=>state('.verification/identity-live-state.json');
const products=()=>state('.verification/submission-ui-before.json').products;
const product=sku=>products().find(p=>p.sku===sku);
const manifestPath='.verification/submission-ui-fixture.json';
const manifest=()=>existsSync(manifestPath)?state(manifestPath):{};
const remember=(label,payload,orderId)=>{
  const saved=manifest();saved[label]={payload,...(saved[label]??{}),...(orderId?{orderId}:{})};
  expect(saved[label].payload).toEqual(payload);
  writeFileSync(manifestPath,JSON.stringify(saved,null,2),{mode:0o600});
};
const rpcPattern='**/rest/v1/rpc/submit_order';
const submit=page=>page.locator('#submit-order');
const draftItems=()=>[
  {productId:product('PDP-DEMO-CREDIT-005').id,quantity:2},
  {productId:product('PDP-DEMO-DATA-005').id,quantity:3},
];
let errors,forbidden;
test.beforeEach(async({page})=>{
  errors=[];forbidden=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    if(/\/storage\/v1|\/auth\/v1\/admin/.test(r.url())) forbidden.push(r.method());
    if(/\/rest\/v1\//.test(r.url())&&r.method()!=='GET'&&!r.url().endsWith('/rpc/submit_order')) forbidden.push(r.method());
  });
});
test.afterEach(()=>{expect(errors).toEqual([]);expect(forbidden).toEqual([]);});
async function login(page,account,admin=false) {
  await page.goto('/login/');await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(admin?/\/admin\//:/\/catalog\//);
  await expect(page.locator('#protected-content')).toBeVisible();
}
async function prepare(page,user,items,label) {
  const saved=manifest()[label];
  await page.evaluate(({draft,request,items,payload})=>{
    localStorage.setItem(draft,JSON.stringify({version:1,items}));localStorage.removeItem(request);
    if(payload)localStorage.setItem(request,JSON.stringify({version:1,status:'pending',payload,orderId:null,draftResolved:false}));
  },{draft:draftKey(user.id),request:requestKey(user.id),items,payload:saved?.payload});
  await page.goto('/new-order/');await expect(page.locator('#draft-items [data-product-id]')).toHaveCount(items.length);
  await expect(page.locator('#draft-total')).toContainText('€');
}
const savedRequest=(page,user)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),requestKey(user.id));
const savedDraft=(page,user)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),draftKey(user.id));
function payloadOnly(body) {
  expect(Object.keys(body).sort()).toEqual(['p_items','p_note','p_request_id']);
  expect(body.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
  for(const line of body.p_items)expect(Object.keys(line).sort()).toEqual(['product_id','quantity']);
}
function verifyOrder(user,payload,id) {
  const literal=v=>`'${String(v).replaceAll("'","''")}'`;
  const sql=`SELECT json_build_object('order',(SELECT row_to_json(o) FROM public.orders o WHERE id=${literal(id)}::uuid),
    'items',(SELECT json_agg(row_to_json(i)) FROM public.order_items i WHERE order_id=${literal(id)}::uuid),
    'count',(SELECT count(*) FROM public.orders WHERE created_by=${literal(user.id)}::uuid AND request_id=${literal(payload.p_request_id)}::uuid)) AS data`;
  const result=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query',
    '--remote=niabpabsvdgxackjjcsb','--read-only','--',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).rows[0].data;
  expect(result.count).toBe(1);expect(result.order.created_by).toBe(user.id);expect(result.order.dealer_id).toBe(user.dealerId);
  expect(result.order.status).toBe('submitted');expect(result.order.note).toBe(payload.p_note);
  expect(result.items.length).toBe(payload.p_items.length);
  for(const input of payload.p_items) {
    const line=result.items.find(i=>i.product_id===input.product_id),p=products().find(p=>p.id===input.product_id);
    expect(line.quantity).toBe(input.quantity);expect(Number(line.unit_price_snapshot)).toBe(Number(p.unit_price));
    expect(line.sku_snapshot).toBe(p.sku);expect(line.name_snapshot).toBe(p.name);
  }
}

test('real multi-product submission, storage/validation guards, duplicate clicks and confirmed cleanup',async({page,context})=>{
  const a=accounts().a;await login(page,a);await page.goto('/new-order/');await expect(submit(page)).toBeDisabled();
  await prepare(page,a,draftItems(),'normal');
  // On a resumed run the existing request is retried rather than duplicated.
  if(!manifest().normal) {
    const qty=page.locator('#draft-items input').first();await qty.fill('0');await expect(submit(page)).toBeDisabled();
    await page.locator('#order-submit-form').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await expect(page.locator('#order-feedback')).toContainText('Review valid quantities');await qty.fill('2');
    await page.getByLabel('Order note',{exact:false}).fill('Synthetic Milestone 6B normal');
    await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restoreWrites=()=>{Storage.prototype.setItem=original;};
      Storage.prototype.setItem=function(k,v){if(k.startsWith('pdp:order-request:'))throw new Error('quota');return original.call(this,k,v);};});
    await submit(page).click();await expect(page.locator('#order-feedback')).toContainText('No order was sent');
    expect(await savedRequest(page,a)).toBeNull();expect((await savedDraft(page,a)).items).toEqual(draftItems());
    await page.evaluate(()=>window.restoreWrites());
    await page.route(rpcPattern,route=>route.fulfill({status:400,json:{code:'22023',message:'Synthetic validation rejection'}}));
    await submit(page).click();await expect(page.locator('#order-feedback')).toContainText('server rejected');
    expect(await savedRequest(page,a)).toBeNull();expect((await savedDraft(page,a)).items).toEqual(draftItems());await page.unroute(rpcPattern);
  }
  if(!manifest().normal)await page.getByLabel('Order note',{exact:false}).fill('Synthetic Milestone 6B normal');
  const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));
  await second.goto('/new-order/');await expect(submit(second)).toBeEnabled();
  let calls=0;
  await context.route(rpcPattern,async route=>{
    calls++;const body=route.request().postDataJSON();payloadOnly(body);remember('normal',body);
    const response=await route.fetch();expect(response.ok()).toBe(true);const id=await response.json();remember('normal',body,id);
    await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({response});
  });
  await page.locator('#order-submit-form').evaluate(f=>{f.requestSubmit();f.requestSubmit();});
  await second.locator('#order-submit-form').evaluate(f=>f.requestSubmit());
  await expect(submit(page)).toBeDisabled();
  await expect(page.locator('#order-feedback')).toContainText('Order submitted successfully');
  const saved=manifest().normal;expect(calls).toBe(1);await expect(page.locator('#order-feedback')).toContainText(saved.orderId);
  await expect(second.locator('#order-feedback')).toContainText(saved.orderId);await second.close();
  expect(await savedDraft(page,a)).toBeNull();expect((await savedRequest(page,a)).draftResolved).toBe(true);
  await expect(page.locator('#site-header [data-draft-count]')).toHaveText('0');
  await expect(page.locator('#clear-draft')).toBeDisabled();
  await page.reload();await expect(page.locator('#order-feedback')).toContainText(saved.orderId);await expect(submit(page)).toBeDisabled();
  expect(calls).toBe(1);verifyOrder(a,saved.payload,saved.orderId);
  const view=page.getByRole('link',{name:'View order',exact:true});
  await expect(view).toHaveAttribute('href',`/order-details/?id=${saved.orderId}`);
  await view.click();await expect(page.locator('#order-reference')).toHaveText(saved.orderId);
  await expect(page.locator('#order-total')).toHaveText('€30.25');
  await page.goto('/new-order/');await expect(page.getByRole('link',{name:'View order',exact:true})).toHaveAttribute('href',`/order-details/?id=${saved.orderId}`);
});

test('lost response after real commit, exact durable retry, inactive denial, logout/account isolation and mobile',async({page})=>{
  const {a,b}=accounts();await login(page,b);
  await prepare(page,b,draftItems(),'uncertain');
  if(!manifest().uncertain)await page.getByLabel('Order note',{exact:false}).fill('Synthetic Milestone 6B uncertain');
  let phase='network';const attempts=[];
  await page.route(rpcPattern,async route=>{
    const body=route.request().postDataJSON();payloadOnly(body);remember('uncertain',body);attempts.push(body);
    if(phase==='network')return route.abort();
    if(phase==='inactive')return route.fulfill({status:403,json:{code:'42501',message:'Synthetic inactive denial'}});
    const response=await route.fetch();expect(response.ok()).toBe(true);remember('uncertain',body,await response.json());
    if(phase==='lost')return route.abort();return route.fulfill({response});
  });
  await submit(page).click();await expect(page.locator('#order-feedback')).toContainText('outcome could not be confirmed');
  await expect(page.locator('#view-order')).toBeHidden();
  const payload=manifest().uncertain.payload;expect((await savedRequest(page,b)).payload).toEqual(payload);
  expect((await savedDraft(page,b)).items).toEqual(draftItems());
  await expect(page.locator('#draft-items input').first()).toBeDisabled();await expect(page.locator('#clear-draft')).toBeDisabled();
  await page.goto('/catalog/');await expect(page.locator('#catalog-feedback')).toContainText('awaiting confirmation');
  await expect(page.getByRole('button',{name:'Add to draft'}).first()).toBeDisabled();
  await page.goto('/new-order/');await expect(submit(page)).toHaveText('Retry saved request');
  phase='inactive';await submit(page).click();await expect(page.locator('#order-feedback')).toContainText('account or organization');
  expect((await savedRequest(page,b)).payload).toEqual(payload);expect((await savedDraft(page,b)).items).toEqual(draftItems());
  phase='lost';await submit(page).click();await expect(page.locator('#order-feedback')).toContainText('outcome could not be confirmed');
  verifyOrder(b,payload,manifest().uncertain.orderId);expect((await savedRequest(page,b)).status).toBe('pending');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.verification/submission-pending-mobile.png',fullPage:true});
  await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);
  expect((await savedRequest(page,b)).payload).toEqual(payload);expect((await savedDraft(page,b)).items).toEqual(draftItems());
  await login(page,a);await page.goto('/new-order/');await expect(page.locator('#empty-draft')).toBeVisible();
  await expect(page.locator('#order-feedback')).not.toContainText(manifest().uncertain.orderId);
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);
  await login(page,b);await page.goto('/new-order/');await expect(submit(page)).toHaveText('Retry saved request');
  await page.route('**/rest/v1/products?**',route=>route.fulfill({json:[]}));await page.reload();
  await expect(page.locator('#draft-state')).toContainText('no longer available');await expect(submit(page)).toBeEnabled();
  phase='success';await submit(page).click();await expect(page.locator('#order-feedback')).toContainText(manifest().uncertain.orderId);
  expect(await savedDraft(page,b)).toBeNull();expect((await savedRequest(page,b)).draftResolved).toBe(true);
  await expect(page.locator('#clear-draft')).toBeDisabled();
  expect(attempts.length).toBe(4);for(const body of attempts)expect(body).toEqual(payload);
  verifyOrder(b,payload,manifest().uncertain.orderId);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.verification/submission-success-mobile.png',fullPage:true});
});

test('inactive profile and admin guards prevent frontend submission',async({page})=>{
  const a=accounts().a;let calls=0;page.on('request',r=>{if(r.url().endsWith('/rpc/submit_order'))calls++;});
  await login(page,a);
  await page.route('**/rest/v1/profiles?**',async route=>{const response=await route.fetch();const rows=await response.json();
    await route.fulfill({response,json:rows.map(p=>({...p,is_active:false}))});});
  await page.goto('/new-order/');await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await expect(page.locator('#protected-content')).toBeHidden();expect(calls).toBe(0);
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);await page.unroute('**/rest/v1/profiles?**');
  await login(page,state('.verification/demo-admin-candidate.json'),true);
  await page.goto('/new-order/');await expect(page).toHaveURL(/\/admin\//);expect(calls).toBe(0);
});
