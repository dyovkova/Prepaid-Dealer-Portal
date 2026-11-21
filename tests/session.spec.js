import { test,expect } from '@playwright/test';
import { readFileSync,writeFileSync } from 'node:fs';

test.skip(process.env.PDP_SESSION_UI_LIVE!=='1','Opt in: existing real synthetic logins and browser-only session loss; no database fixtures or orders');
const state=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const accounts=()=>state('.verification/identity-live-state.json');
const data=()=>state('.verification/session-before.json').data;
const own=user=>data().orders.filter(o=>o.dealer_id===user.dealerId);
let requests,errors,consoleErrors,forbidden;
const claims=header=>{try{return JSON.parse(Buffer.from(header.replace(/^Bearer /i,'').split('.')[1],'base64url').toString());}catch{return{};}};
test.beforeEach(async({page})=>{
  requests=[];errors=[];consoleErrors=[];forbidden=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.route('**/rest/v1/**',async route=>{
    const r=route.request(),token=r.headers().authorization??'',jwt=claims(token);
    requests.push({path:new URL(r.url()).pathname,hasJWT:token.startsWith('Bearer eyJ'),role:jwt.role,subject:jwt.sub});
    if(r.method()!=='GET'){forbidden.push('database write');return route.abort();}
    await route.continue();
  });
});
test.afterEach(async({},info)=>{
  const report={test:info.title,status:info.status,requests,errors,consoleErrors,forbidden};
  const path=process.env.PDP_SESSION_NETLIFY==='1'?'.verification/session-netlify-report.json':'.verification/session-local-report.json';
  let reports=[];try{reports=state(path);}catch{}reports.push(report);writeFileSync(path,JSON.stringify(reports,null,2));
  expect(forbidden).toEqual([]);expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
  expect(requests.every(r=>r.hasJWT&&r.role==='authenticated')).toBe(true);
});
async function enter(page,user){
  await page.goto('/login/');await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
}
async function dealer(page,user){await enter(page,user);await expect(page).toHaveURL(/\/catalog\//);await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);}

test('real dealer identity/catalog/history reads use its JWT through refresh and account switching',async({page})=>{
  for(const user of [accounts().a,accounts().b]){
    const start=requests.length;await dealer(page,user);await page.reload();await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
    await page.goto('/my-orders/');await expect(page.locator('#order-list [data-order-id]')).toHaveCount(own(user).length);
    await page.goto(`/order-details/?id=${own(user)[0].id}`);await expect(page.locator('#order-reference')).toHaveText(own(user)[0].id);
    await page.reload();await expect(page.locator('#order-reference')).toHaveText(own(user)[0].id);
    const reads=requests.slice(start);expect(reads.some(r=>r.path.endsWith('/dealers'))).toBe(true);
    expect(reads.every(r=>r.subject===user.id)).toBe(true);
    await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);
  }
});

test('session disappearing after role read sends no anonymous dealer request and recovers on login',async({page})=>{
  let lose=true;const user=accounts().a;
  await page.route('**/rest/v1/user_roles?**',async route=>{
    const r=route.request(),jwt=claims(r.headers().authorization??'');
    requests.push({path:new URL(r.url()).pathname,hasJWT:true,role:jwt.role,subject:jwt.sub});
    const response=await route.fetch();
    if(lose){lose=false;await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('sb-')&&key.endsWith('-auth-token'))localStorage.removeItem(key);});}
    await route.fulfill({response});
  });
  await enter(page,user);await expect(page.locator('#account-status')).toContainText('Your session changed or ended');
  expect(requests.some(r=>r.path.endsWith('/dealers'))).toBe(false);
  await page.getByRole('button',{name:'Check account again',exact:true}).click();
  await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeEnabled();
  await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/catalog\//);
  await expect(page.locator('#product-grid [data-product-id]')).toHaveCount(10);
});

test('permanent admin keeps its role guard and persistent authenticated reads',async({page})=>{
  const user=state('.verification/demo-admin-candidate.json');await enter(page,user);await expect(page).toHaveURL(/\/admin\//);
  await page.reload();await expect(page.getByRole('heading',{name:'Admin dashboard',exact:true})).toBeVisible();
  for(const path of ['/catalog/','/new-order/','/my-orders/',`/order-details/?id=${own(accounts().a)[0].id}`]){
    await page.goto(path);await expect(page).toHaveURL(/\/admin\//);
  }
  expect(requests.every(r=>r.subject===user.id)).toBe(true);expect(requests.some(r=>r.path.endsWith('/dealers'))).toBe(false);
  await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/\/login\//);
});
