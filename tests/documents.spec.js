import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {admin,dealer,other,orderId,stage,remember,savedDocument,recoveryKey,pdf,hash,login,details,downloaded,active,edgeDenied,switchTo,state} from './document-ui-support.js';
test.skip(process.env.PDP_DOCUMENT_UI_LIVE!=='1','Opt in: controlled synthetic PDF UI fixtures only, no orders or backend changes');
let failures,requests;
test.beforeEach(async({page})=>{
 failures=[];requests=[];page.on('pageerror',e=>failures.push(e.message));
 await page.route('**/storage/v1/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;requests.push({kind:'storage',method:r.method()});
  if(r.method()!=='POST'||!path.startsWith('/storage/v1/object/order-documents/'+orderId+'/')){failures.push('Forbidden frontend Storage operation');return route.abort();}
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryKey());
  if(!record||!record.fileName.startsWith('Synthetic 11B')||!path.endsWith('/'+record.id+'.pdf')||r.headers()['x-upsert']!=='false'){failures.push('Unexpected upload intent');return route.abort();}
  remember(record);await route.continue();
 });
 await page.route('**/rest/v1/**',async route=>{const r=route.request(),url=new URL(r.url());
  if(r.method()!=='GET'){failures.push('Unexpected database mutation');return route.abort();}
  if(url.pathname==='/rest/v1/order_documents'&&url.searchParams.get('select')?.includes('object_path'))failures.push('Storage path requested');
  await route.continue();
 });
 page.on('request',r=>{if(r.url().includes('/functions/v1/'))requests.push({kind:'edge',name:new URL(r.url()).pathname.split('/').at(-1),method:r.method()});});
});
test.afterEach(async({},info)=>{writeFileSync(`.verification/11b-${stage()}-${info.testId.replace(/[^a-z0-9]/gi,'').slice(-12)}.json`,JSON.stringify({title:info.title,status:info.status,failures,requests},null,2));expect(failures).toEqual([]);});

test('real admin PDF upload, lost publication response, refresh and exact retry, download and mobile layouts',async({page})=>{
 const file=await pdf();await login(page);await details(page);
 await expect(page.locator('#order-documents form')).toBeVisible();
 const saved=savedDocument();
 if(!saved){
  await page.locator('#document-file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not a PDF')});
  await page.locator('[data-submit]').click();await expect(page.locator('[data-feedback]')).toContainText('Select a nonempty PDF');
  await page.locator('#document-file').setInputFiles({name:'Too big.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(10*1024*1024+1)});
  await page.locator('[data-submit]').click();await expect(page.locator('[data-feedback]')).toContainText('at most 10 MiB');
  let lost=false;await page.route('**/functions/v1/publish-order-document',async route=>{if(!lost){lost=true;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();});
  await page.locator('#document-file').setInputFiles(file);await page.locator('[data-submit]').click();
  await expect(page.locator('[data-feedback]')).toContainText('could not be confirmed');
  const pending=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryKey());remember(pending);expect(pending.phase).toBe('uploaded');
  await page.reload();await expect(page.getByRole('button',{name:'Retry saved PDF',exact:true})).toBeEnabled();await expect(page.locator('[data-saved]')).toContainText(file.name);
  await page.getByRole('button',{name:'Retry saved PDF',exact:true}).click();await expect(page.locator('[data-feedback]')).toContainText('PDF published');
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryKey())).id).toBe(pending.id);
  expect(requests.filter(r=>r.kind==='storage')).toHaveLength(1);
 }
 await downloaded(page,file.name,hash(file.buffer));await page.reload();await expect(page.getByRole('button',{name:`Download ${file.name}`,exact:true})).toBeVisible();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.verification/11b-${stage()}-admin-${width}.png`,fullPage:true});}
 expect(await page.locator('#order-documents').innerText()).not.toContain('order-documents/');
});

test('dealer download, cross-organization and inactive denial, refresh and session switching',async({page})=>{
 const record=savedDocument();expect(record).toBeTruthy();await login(page,dealer(),'dealer');await details(page,'dealer');
 await expect(page.locator('#order-documents form')).toHaveCount(0);await downloaded(page,record.fileName,record.digest);
 await page.reload();await expect(page.getByRole('button',{name:`Download ${record.fileName}`,exact:true})).toBeVisible();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.verification/11b-${stage()}-dealer-${width}.png`,fullPage:true});}
 try{await active(false);await page.getByRole('button',{name:`Download ${record.fileName}`,exact:true}).click();await expect(page.locator('[data-feedback]')).toContainText('access denied');await edgeDenied(dealer(),record.id);}finally{await active(true);}
 await page.reload();await expect(page.getByRole('button',{name:`Download ${record.fileName}`,exact:true})).toBeVisible();
 await switchTo(page,other());await expect(page.locator('#details-state')).toContainText('Order unavailable');await expect(page.locator('#order-documents')).toBeHidden();
 await edgeDenied(other(),record.id);await page.goto('/admin/orders/?id='+orderId);await expect(page).toHaveURL(/\/catalog\//);
});

test('document API errors/reload, empty state and late downloads never reach a switched account',async({page})=>{
 await login(page,dealer(),'dealer');let fail=true;
 await page.route('**/rest/v1/order_documents?**',async route=>{if(fail)await route.fulfill({status:503,json:{message:'Controlled outage'}});else await route.continue();});
 await details(page,'dealer');await expect(page.locator('[data-state]')).toContainText('could not be confirmed');
 fail=false;await page.locator('[data-reload]').click();const record=savedDocument();await expect(page.getByRole('button',{name:`Download ${record.fileName}`,exact:true})).toBeEnabled();
 let release,started;const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
 await page.route('**/functions/v1/download-order-document',async route=>{const response=await route.fetch();started();await gate;await route.fulfill({response}).catch(()=>{});});
 let downloads=0;page.on('download',()=>downloads++);await page.getByRole('button',{name:`Download ${record.fileName}`,exact:true}).click();await waiting;
 await switchTo(page,other());await expect(page.locator('#details-state')).toContainText('Order unavailable');release();await page.waitForTimeout(300);expect(downloads).toBe(0);
});

test('rejected existing PDF keeps recovery intent; another account never sees it; empty listing is explicit',async({page})=>{
 await login(page);await details(page);
 const rejected=state('.verification/document-storage-live-state.json').documents.find(d=>d.kind==='malformed');
 const pending={version:1,id:rejected.id,orderId,fileName:rejected.fileName,size:rejected.byteSize,digest:rejected.sha256,phase:'uploaded'};
 await page.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:recoveryKey(),value:pending});await page.reload();
 await expect(page.getByRole('button',{name:'Retry saved PDF',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Retry saved PDF',exact:true}).click();
 await expect(page.locator('[data-feedback]')).toContainText('rejected by server validation');
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),recoveryKey())).toEqual(pending);
 await expect(page.getByRole('button',{name:'Upload another PDF',exact:true})).toBeHidden();
 await switchTo(page,dealer());await expect(page).toHaveURL(/\/catalog\//);await details(page,'dealer');
 await expect(page.locator('#order-documents form')).toHaveCount(0);await expect(page.locator('#order-documents')).not.toContainText(rejected.fileName);
 await switchTo(page,admin());await expect(page).toHaveURL(/\/admin\/(?:\?|$)/);await details(page);await expect(page.locator('[data-saved]')).toContainText(rejected.fileName);
 await page.route('**/rest/v1/order_documents?**',route=>route.fulfill({json:[]}));await page.locator('[data-reload]').click();await expect(page.locator('[data-state]')).toContainText('No published documents');
 expect(requests.filter(r=>r.kind==='storage')).toEqual([]);
});
