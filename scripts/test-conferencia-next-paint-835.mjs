import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const frames=[], idle=[];
const sandbox={exports:{},setTimeout:fn=>idle.push(fn),requestAnimationFrame:fn=>frames.push(fn),requestIdleCallback:fn=>idle.push(fn)};
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.createContext(sandbox);
vm.runInContext(compile(fs.readFileSync('src/lib/conferencia/conferenciaAfterPaint.ts','utf8')),sandbox);
const source=fs.readFileSync('src/services/dataStore.ts','utf8');
const start=source.indexOf('export function endConferenciaModalSaveBatch(');
const end=source.indexOf('/** Lançamento foto a foto',start);
let saves=0, notifications=0, fail=false, acknowledgements=0;
Object.assign(sandbox,{
  conferenciaAfterPaint:sandbox.exports.conferenciaAfterPaint,
  conferenciaAfterPaintScheduled:false,conferenciaPersistCallbacks:[],memoryCache:{revision:1},
  endSaveBatch:()=>{},persistConferenciaModalSnapshotWithFallback:s=>{saves++;assert.equal(s.revision,2);return fail?{ok:false,error:'quota'}:{ok:true};},
  notify:()=>notifications++,notifyImmediate:()=>{throw Error('synchronous notification blocks next');},
  isConferenciaDeferLocalPersistActive:()=>true,
  flushConferenciaDeferredLocalPersistSync:()=>{throw Error('synchronous full snapshot blocks next');},
  scheduleConferenciaDeferredLocalPersist:()=>{},
});
vm.runInContext(compile(source.slice(start,end)),sandbox);
const finish=sandbox.exports.endConferenciaModalSaveBatch;
for(let i=0;i<3;i++)assert.equal(finish({afterPaint:true,onPersist:r=>{assert.equal(r.ok,true);acknowledgements++;}}).ok,true);
assert.equal(saves,0,'click does not serialize or write the full data');
assert.equal(acknowledgements,0,'scheduling is not a durable receipt');
frames.shift()();assert.equal(saves,0,'first frame remains available for the next delivery');
frames.shift()();assert.equal(saves,0,'work waits for idle after painting');
sandbox.memoryCache={revision:2};idle.shift()();
assert.equal(saves,1,'rapid approvals coalesce into one full snapshot');
assert.equal(acknowledgements,3);assert.equal(notifications,1);
fail=true;let failure;
finish({afterPaint:true,onPersist:r=>failure=r});frames.shift()();frames.shift()();idle.shift()();assert.equal(failure.ok,false);
const staff=fs.readFileSync('src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx','utf8');
const approval=staff.slice(staff.indexOf('  const handleLancarNota ='),staff.indexOf('  const handleRejeitarNota ='));
assert.ok(approval.indexOf('const checkpointFinal = salvarConferenciaCheckpoint(')<approval.indexOf('    travarLancamentoConferencia();'),'small checkpoint precedes approval');
assert.match(approval,/if \(!checkpointFinal.ok\)[\s\S]*?return;/,'storage failure cannot approve');
assert.match(approval,/afterPaint: true/);
console.log('PASS: next delivery paints before full snapshot; 3 approvals use 1 latest snapshot; acknowledgement follows storage; storage errors reported; recovery checkpoint precedes approval.');
