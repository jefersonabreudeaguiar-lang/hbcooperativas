import assert from 'node:assert/strict';
import { emptyInitialData } from '../src/mock/data';
import { conferirEntradaStaffExistente, registrarEntradaStaffConferida } from '../src/lib/staff/staffEntradaVerifiedCache';
import type { CooperativaCloudRevision } from '../src/lib/performance/cooperadoEventDrivenSync';
async function main(){
 const values = new Map<string,string>(); const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}};
 let data=structuredClone(emptyInitialData), reads=0;
 const revision:CooperativaCloudRevision={operacionalUpdatedAt:'2026-11-09T10:00:00Z',operationalResetVersion:0,contratosUpdatedAt:'c1',notasUpdatedAt:'n1'};
 const read=async()=>{reads++;return revision};
 assert.equal(await conferirEntradaStaffExistente('owner',()=>data,read,store),null);assert.equal(reads,0);
 await registrarEntradaStaffConferida('owner',data,revision,store);
 assert.deepEqual(await conferirEntradaStaffExistente('owner',()=>data,read,store),revision);
 assert.equal(await conferirEntradaStaffExistente('other-tenant',()=>data,read,store),null);
 assert.equal(await conferirEntradaStaffExistente('owner',()=>data,async()=>null,store),null,'offline never proves freshness');
 assert.equal(await conferirEntradaStaffExistente('owner',()=>data,async()=>({...revision,notasUpdatedAt:'n2'}),store),null);
 data={...data,auditLog:[{id:'local-change'} as never]};
 assert.equal(await conferirEntradaStaffExistente('owner',()=>data,read,store),null,'edited local snapshot cannot reuse proof');
 await registrarEntradaStaffConferida('owner',data,revision,store);
 assert.equal(await conferirEntradaStaffExistente('owner',()=>data,async()=>{data={...data,auditLog:[]};return revision},store),null,'concurrent local change invalidates proof');
 await registrarEntradaStaffConferida('owner',data,revision,{setItem(){throw Error('Quota')}});
 console.log('PASS: fast reentry requires unchanged local bytes, same tenant and fresh cloud proof; failures, edits and concurrent changes force full read.');
}
void main();
