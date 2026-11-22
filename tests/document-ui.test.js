import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {validatePdfFile,publishedDocument,MAX_PDF_BYTES} from '../src/documents/model.js';
import {readUpload,writeUpload,startAnotherUpload,uploadKey} from '../src/documents/recovery.js';
import {processPdf} from '../src/documents/upload.js';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',order='00000000-0000-4000-8000-000000000003';
const account={userId:owner,role:'admin',status:'active'},file=()=>new File(['%PDF-1.7\nSynthetic fixture\n%%EOF'],'Synthetic.pdf',{type:'application/pdf'});
let values,failWrites;
beforeEach(()=>{
 values=new Map();failWrites=false;
 globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(failWrites)throw new Error('Blocked');values.set(key,value);},removeItem:key=>values.delete(key)};
 const queue=new Map();Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(key,work)=>{const result=(queue.get(key)??Promise.resolve()).catch(()=>{}).then(work);queue.set(key,result);return result;}}}});
});
test('file and metadata validation reject spoofed names/types/size and discard object paths',()=>{
 assert.equal(validatePdfFile(file()).name,'Synthetic.pdf');
 for(const value of [null,new File(['x'],'x.pdf',{type:'text/plain'}),new File([],'x.pdf',{type:'application/pdf'}),{name:'x.pdf',size:MAX_PDF_BYTES+1,type:'application/pdf'}, {name:'../x.pdf',size:1,type:'application/pdf'}])assert.throws(()=>validatePdfFile(value));
 const model=publishedDocument({id:other,order_id:order,file_name:'Synthetic.pdf',byte_size:100,created_at:'2026-11-22T00:00:00Z',object_path:'never propagate this'},order);
 assert.ok(!('object_path'in model));assert.equal(model.name,'Synthetic.pdf');
});
test('queued duplicate clicks share one durable UUID and confirmed receipt; only explicit next-upload clears it',async()=>{
 let uploads=0,publications=0;const services={upload:async()=>uploads++,publish:async(a,r)=>{publications++;return r.id;}};
 const [a,b]=await Promise.all([processPdf(account,order,file(),services),processPdf(account,order,file(),services)]);
 assert.equal(a.id,b.id);assert.equal(uploads,1);assert.equal(publications,1);assert.equal(readUpload(owner,order).phase,'confirmed');
 startAnotherUpload(owner,order,a.id);assert.equal(readUpload(owner,order),null);
});
test('uncertain publication survives refresh; exact retry needs no file and never uploads again',async()=>{
 let uploads=0,failed=true;const attempts=[],services={upload:async()=>uploads++,publish:async(a,r)=>{attempts.push(structuredClone(r));if(failed)throw new Error('Lost response');return r.id;}};
 await assert.rejects(processPdf(account,order,file(),services));const saved=readUpload(owner,order);assert.equal(saved.phase,'uploaded');
 failed=false;const recovered=await processPdf(account,order,null,services);assert.equal(recovered.id,saved.id);assert.equal(uploads,1);assert.deepEqual(attempts[0],attempts[1]);
});
test('ambiguous upload retries publication first when no file is selected, preserving the original request',async()=>{
 let uploads=0;const services={upload:async()=>{uploads++;throw new Error('Lost upload receipt');},publish:async(a,r)=>r.id};
 await assert.rejects(processPdf(account,order,file(),services));const id=readUpload(owner,order).id;
 assert.equal((await processPdf(account,order,null,services)).id,id);assert.equal(uploads,1);
});
test('mismatched replacement, account/order leakage and corrupt records fail closed without clearing pending data',async()=>{
 const services={upload:async()=>{},publish:async()=>{throw new Error('Pending');}};
 await assert.rejects(processPdf(account,order,file(),services));const saved=readUpload(owner,order);
 await assert.rejects(processPdf(account,order,new File(['different'],'Synthetic.pdf',{type:'application/pdf'}),services),/exact original/);
 assert.deepEqual(readUpload(owner,order),saved);assert.equal(readUpload(other,order),null);assert.equal(readUpload(owner,other),null);
 assert.throws(()=>startAnotherUpload(owner,order,saved.id),/unresolved/);
 values.set(uploadKey(other,order),'corrupt');assert.throws(()=>readUpload(other,order),/unreadable|cannot be read/);
});
test('blocked persistence sends nothing; lost confirmation persistence preserves exact retry and abort preserves intent',async()=>{
 let sends=0;failWrites=true;await assert.rejects(processPdf(account,order,file(),{upload:async()=>sends++,publish:async()=>sends++}));assert.equal(sends,0);
 failWrites=false;const services={upload:async()=>{},publish:async(a,r)=>{failWrites=true;return r.id;}};
 await assert.rejects(processPdf(account,order,file(),services));failWrites=false;const saved=readUpload(owner,order);assert.equal(saved.phase,'uploaded');
 const signal=new AbortController();signal.abort();await assert.rejects(processPdf(account,order,null,services,()=>{},signal.signal));assert.deepEqual(readUpload(owner,order),saved);
 assert.equal((await processPdf(account,order,null,{publish:async(a,r)=>r.id})).id,saved.id);
 assert.throws(()=>writeUpload(owner,{...saved,id:other}),/cannot be replaced/);
});
