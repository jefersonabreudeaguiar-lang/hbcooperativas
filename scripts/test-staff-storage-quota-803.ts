import assert from 'node:assert/strict';
import vm from 'node:vm';
import { writeAppDataPersistRaw, readAppDataPersistRaw, decodePersisted, compactarCachesAppSemPerda } from '../src/lib/staff/appDataPersistIo';
import { buildInlineCooperadoAppDataWarmScript } from '../src/lib/performance/cooperadoAppDataInlineWarm';

const cnpj='88888888000181';
const legacy=JSON.stringify({notasPedido:[{id:'unsent',fotoPedido:'data:image/png;base64,'+'A'.repeat(12000),status:'rascunho'}],pagamentosCooperado:[{id:'paid',reciboHtml:'<p>Receipt</p>'.repeat(200)}]});
const scoped=JSON.stringify({notasPedido:[{id:'pending'}],pagamentosCooperado:[{id:'payment',status:'confirmado'}]});
const target=JSON.stringify({notasPedido:[{id:'cloud-current'}],pagamentosCooperado:[{id:'payment',status:'confirmado',reciboHtml:'<p>Receipt</p>'.repeat(400)}]});
const values=new Map<string,string>([['coopeagriplla_data',legacy],[`coopeagriplla_data:${cnpj}`,scoped],['coopeagriplla_session',JSON.stringify({role:'responsavel',cooperativaCnpj:cnpj})],['pending-photo-queue','PENDING-KEEP'],['other-service-key','UNTOUCHED']]);
const max=[...values.values()].reduce((s,v)=>s+v.length,0)+10;
let removals=0;
const store={ get length(){return values.size},key(i:number){return [...values.keys()][i]??null},getItem(k:string){return values.get(k)??null},setItem(k:string,v:string){const size=[...values].reduce((s,[key,value])=>s+(key===k?0:value.length),0)+v.length;if(size>max)throw new DOMException('Quota','QuotaExceededError');values.set(k,v)},removeItem(){removals++;throw Error('Deletion forbidden')}};
assert.throws(()=>store.setItem(`coopeagriplla_data:${cnpj}`,target), /Quota/);
const beforeQueue=values.get('pending-photo-queue'),beforeSession=values.get('coopeagriplla_session');
assert.equal(writeAppDataPersistRaw(target,{role:'responsavel',cnpj,storage:store}),true,'full normal profile recovers without clearing storage');
assert.equal(readAppDataPersistRaw({role:'responsavel',cnpj,storage:store}),target);
assert.equal(decodePersisted(values.get('coopeagriplla_data')!),legacy,'unsent image and historic receipt stay byte identical after decode');
assert.equal(values.get('pending-photo-queue'),beforeQueue);assert.equal(values.get('coopeagriplla_session'),beforeSession);assert.equal(values.get('other-service-key'),'UNTOUCHED');assert.equal(removals,0);
const noWrites={getItem:(k:string)=>k==='coopeagriplla_data'?legacy:null,setItem(){throw Error('Denied')},removeItem(){throw Error('Forbidden')}};
compactarCachesAppSemPerda(noWrites,cnpj);assert.equal(noWrites.getItem('coopeagriplla_data'),legacy);
const migrationSource=JSON.stringify({cooperativas:[{id:'coop',cnpj}],notasPedido:[{id:'offline',cooperativaId:'coop',fotoPedido:'data:image/jpeg;base64,KEEP'}]});
const fullMigration={getItem:(k:string)=>k==='coopeagriplla_data'?migrationSource:null,setItem(){throw new DOMException('Quota','QuotaExceededError')},removeItem(){throw Error('Forbidden')}};
assert.equal(readAppDataPersistRaw({role:'responsavel',cnpj,storage:fullMigration}),migrationSource,'quota during legacy migration must not hide pending local data');
// Early head bootstrap must never hydrate a staff session from the legacy global blob.
for(const role of ['responsavel','tesoureiro','admin','contador']){
 let globalReads=0;
 const context={localStorage:{getItem(k:string){if(k==='coopeagriplla_session')return JSON.stringify({role});globalReads++;return legacy}},window:{location:{pathname:'/dashboard'}}};
 vm.runInNewContext(buildInlineCooperadoAppDataWarmScript(),context);
 assert.equal(globalReads,0,role);
}
console.log('PASS: quota recovery is lossless, preserves pending photos/receipts/credentials, never deletes, and staff bootstrap never uses global legacy cache.');
