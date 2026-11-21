import { test,expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { state,baseline,admin,dealer,fixture,extraCount,remember,card,cards,login,openProducts,fill,save,status,restoreProducts } from './admin-product-support.js';
import { login as publicLogin,request,ok } from '../supabase/verification/order_live_support.mjs';
import { history } from '../supabase/verification/admin_product_live_checks.mjs';

test.skip(process.env.PDP_ADMIN_PRODUCTS_UI!=='1','Opt in: existing accounts, one reusable synthetic UI product, restored referenced product; no users/orders');
const api='**/rest/v1/products?**';
let errors,forbidden,reference,writes;
test.beforeEach(async({page,context})=>{
  errors=[];forbidden=[];reference=null;writes=[];
  const watch=p=>p.on('pageerror',e=>errors.push(e.message));context.pages().forEach(watch);context.on('page',watch);
  await context.route('**/rest/v1/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname;
    if(r.method()!=='GET'){
      if(path!=='/rest/v1/products'){forbidden.push(path);return route.abort();}
      if(r.method()==='POST'&&![fixture().sku,baseline().products[0].sku].includes(r.postDataJSON().sku)){
        forbidden.push('Unapproved synthetic insert');return route.abort();
      }
      writes.push({method:r.method(),body:r.postData()?r.postDataJSON():null});
      expect(['POST','PATCH','DELETE']).toContain(r.method());
    }
    await route.continue();
  });
  page.on('request',r=>{if(/\/auth\/v1\/admin|\/storage\/v1/.test(r.url()))forbidden.push('out of scope');});
});
test.afterEach(async({},info)=>{
  await restoreProducts(reference);
  expect(errors).toEqual([]);expect(forbidden).toEqual([]);
  writeFileSync(`.verification/8b-${process.env.PDP_ADMIN_PRODUCTS_NETLIFY==='1'?'netlify':'preview'}-${info.testId.replace(/[^a-z0-9]/gi,'').slice(-16)}.json`,JSON.stringify({test:info.title,status:info.status,writes,errors,forbidden},null,2));
});

test('real admin creation/editing, duplicate SKU, search/status, confirmations, refresh and mobile',async({page})=>{
  await openProducts(page);await expect(cards(page)).toHaveCount(baseline().products.length+extraCount());
  const expected={sku:fixture().sku,name:'Synthetic 8B product',description:'Controlled synthetic UI product',unit_price:'3.25'};
  if(!fixture().id){
    await page.locator('#new-product').click();await page.getByRole('button',{name:'Save product',exact:true}).click();
    await expect(page.locator('#product-editor [role="status"]')).toContainText('nonblank SKU');expect(writes).toEqual([]);
    await fill(page,{...expected,unit_price:'-1'});await page.getByRole('button',{name:'Save product',exact:true}).click();
    await expect(page.locator('#product-editor [role="status"]')).toContainText('EUR price');expect(writes).toEqual([]);
    await fill(page,expected);
    const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/rest/v1/products');
    await save(page,'Product created.');const data=await(await response).json();remember({sku:expected.sku,id:(Array.isArray(data)?data[0]:data).id});
  }
  const id=fixture().id;
  if((await card(page,id).locator('[data-status]').textContent())==='Inactive')await status(page,id,'Reactivate');
  await card(page,id).getByRole('button',{name:`Edit ${fixture().sku}`,exact:true}).click();
  await fill(page,{name:'Synthetic 8B edited product',description:'Updated synthetic UI product',unit_price:'4.75'});
  const count=writes.filter(w=>w.method==='PATCH').length;
  await page.locator('#product-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await expect(page.locator('#products-feedback')).toHaveText('Product saved.');
  expect(writes.filter(w=>w.method==='PATCH').length-count).toBe(1);
  expect(Object.keys(writes.filter(w=>w.method==='PATCH').at(-1).body).sort()).toEqual(['description','name','sku','unit_price']);
  await expect(card(page,id).locator('[data-price]')).toContainText('€4.75');
  const search=page.getByLabel('Search products',{exact:true}),filter=page.getByLabel('Product status',{exact:true});
  await search.fill(fixture().sku.toLowerCase());await expect(cards(page)).toHaveCount(1);
  await filter.selectOption('active');await expect(cards(page)).toHaveCount(1);
  await filter.selectOption('inactive');await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('#products-state')).toContainText('No products match');
  await filter.selectOption('all');await search.fill('');
  await page.locator('#new-product').click();await fill(page,{...expected,sku:baseline().products[0].sku});
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await expect(page.locator('#product-editor [role="status"]')).toContainText('SKU is already in use');
  await expect(page.getByLabel('Product name',{exact:true})).toHaveValue(expected.name);
  await page.getByRole('button',{name:'Cancel editing',exact:true}).click();
  if((await card(page,id).locator('[data-status]').textContent())==='Inactive')await status(page,id,'Reactivate');
  const before=writes.length;await status(page,id,'Archive',false);expect(writes.length).toBe(before);
  await status(page,id,'Archive');await status(page,id,'Reactivate');await page.reload();
  await expect(card(page,id).locator('[data-status]')).toHaveText('Active');
  await expect(card(page,id).locator('[data-price]')).toContainText('€4.75');
  await page.screenshot({path:'.verification/admin-products-desktop.png',fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await card(page,id).getByRole('button',{name:`Edit ${fixture().sku}`,exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`.verification/admin-products-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Cancel editing',exact:true}).click();
  }
  await status(page,id,'Archive');
});

test('loading, empty/retry, safe text, pagination and uncertain/zero-row saves',async({page})=>{
  await login(page,admin());
  let mode='failure';const row=baseline().products[0];
  await page.route(api,async route=>{
    if(route.request().method()!=='GET')return route.continue();
    if(mode==='failure')return route.fulfill({status:503,json:{message:'Controlled outage'}});
    if(mode==='empty')return route.fulfill({json:[]});
    if(mode==='safe')return route.fulfill({json:[{...row,name:'<img src=x onerror="window.badProduct=true">',description:'<script>window.badProduct=true</script>'}]});
    const offset=Number(new URL(route.request().url()).searchParams.get('offset'));
    return route.fulfill({json:Array.from({length:offset?1:200},(_,i)=>({...row,id:`00000000-0000-4000-8000-${String(offset+i).padStart(12,'0')}`,sku:`PDP-MOCK-${offset+i}`}))});
  });
  await page.goto('/admin/products/');await expect(page.locator('#products-state')).toContainText('Could not load');
  await expect(page.locator('#new-product')).toBeDisabled();
  mode='empty';await page.locator('#reload-products').click();await expect(page.locator('#products-state')).toContainText('No products yet');
  await page.locator('#new-product').click();await fill(page,{sku:'PDP-TEST-8B-NETWORK',name:'Synthetic network test',unit_price:'1'});
  await page.route(api,route=>route.request().method()==='POST'?route.abort():route.fallback());
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await expect(page.locator('#products-feedback')).toContainText('may already be saved');
  await expect(page.getByLabel('SKU',{exact:true})).toHaveValue('PDP-TEST-8B-NETWORK');
  mode='safe';await page.locator('#reload-products').click();await expect(cards(page)).toHaveCount(1);
  await page.getByRole('button',{name:'Cancel editing',exact:true}).click();
  await expect(cards(page).locator('h3')).toContainText('<img');expect(await page.evaluate(()=>window.badProduct)).toBeUndefined();
  await expect(page.locator('#admin-product-grid img, #admin-product-grid script')).toHaveCount(0);
  mode='pages';await page.locator('#reload-products').click();await expect(cards(page)).toHaveCount(201);
  await cards(page).first().getByRole('button',{name:/^Edit /}).click();
  await page.route(api,async route=>route.request().method()==='PATCH'
    ?route.fulfill({json:[]}):route.fallback());
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await expect(page.locator('#products-feedback')).toContainText('access changed');
});

test('dealer/anonymous/inactive guards and real RLS deny product administration',async({page})=>{
  await page.goto('/admin/products/');await expect(page).toHaveURL(/\/login\//);
  await login(page,dealer(),false);await page.goto('/admin/products/');await expect(page).toHaveURL(/\/catalog\//);
  await page.reload();await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
  const token=await publicLogin(dealer());const id=fixture().id;
  const denied=await request('/rest/v1/products',token,'POST',{sku:'PDP-TEST-8B-DENIED',name:'Denied',unit_price:1});
  expect(denied.body.code).toBe('42501');expect([401,403]).toContain(denied.status);
  expect(ok(await request(`/rest/v1/products?id=eq.${id}`,token,'PATCH',{unit_price:99},{Prefer:'return=representation'}))).toEqual([]);
  expect((await request(`/rest/v1/products?id=eq.${id}`,token,'DELETE')).body.code).toBe('42501');
  await page.getByRole('button',{name:'Log out',exact:true}).click();await login(page,admin());
  await page.route('**/rest/v1/profiles?**',async route=>{
    const response=await route.fetch();await route.fulfill({response,json:(await response.json()).map(p=>({...p,is_active:false}))});
  });
  await page.goto('/admin/products/');await expect(page.locator('#account-status')).toContainText('Your account is inactive');
  await expect(page.locator('#protected-content')).toBeHidden();await expect(cards(page)).toHaveCount(0);
});

test('UI archive and repricing preserve real saved order snapshots and restore the demo product',async({page})=>{
  const data=baseline(),own=data.orders.filter(o=>o.dealer_id===dealer().dealerId);
  reference=data.products.find(p=>p.is_active&&p.sku.startsWith('PDP-DEMO-')&&data.items.some(i=>i.product_id===p.id&&own.some(o=>o.id===i.order_id)));
  expect(reference).toBeTruthy();await openProducts(page);
  await card(page,reference.id).getByRole('button',{name:`Edit ${reference.sku}`,exact:true}).click();
  await fill(page,{sku:'PDP-TEST-8B-SNAPSHOT',name:'Synthetic temporary history test',unit_price:'88.99'});await save(page);
  await status(page,reference.id,'Archive');
  const token=await publicLogin(dealer());
  expect(ok(await request(`/rest/v1/products?id=eq.${reference.id}&select=*`,token))).toEqual([]);
  await history(token,data,dealer());
  await card(page,reference.id).getByRole('button',{name:'Edit PDP-TEST-8B-SNAPSHOT',exact:true}).click();
  await fill(page,reference);await save(page);await status(page,reference.id,'Reactivate');
});
