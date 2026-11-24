import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { conferenciaCheckpointKey, salvarConferenciaCheckpoint, lerConferenciaCheckpoint } from '../src/lib/conferencia/conferenciaCheckpoint.ts';
const src=fs.readFileSync('src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx','utf8');
const start=src.indexOf('  const lancarFotoConferenciaAtual = useCallback(');
const end=src.indexOf('  const aquecerUiConferencia',start);
const callback=src.slice(start,end);
assert.doesNotMatch(callback,/updateData|aplicarLancamentoFotoConferenciaEmDados|requestAppSync|fetch\(/);
let draft, fail=false, writes=0;
const disk=new Map();
const storage={setItem(k,v){if(fail)throw Error('quota');writes++;disk.set(k,v);},getItem(k){return disk.get(k)??null;}};
const refs={current:new Map()}, launched={current:new Set()};
const selectedNota={id:'nota-a',relancadaEm:undefined};
const key=conferenciaCheckpointKey('user-a','coop-a','nota-a');
const item={produtoInstituicaoId:'p',produtoNome:'Mamão',unidade:'kg',precoUnitario:5,quantidade:7};
const ctx={useCallback:f=>f,user:{id:'user-a'},selectedNota,coopId:'coop-a',data:{fichaCorrida:[]},
  conferenciaItens:[item],conferenciaDescontoPct:5,conferenciaDivisaoQtd:0,conferenciaDivisaoIds:[],
  conferenciaCooperadoId:'c',conferenciaInstId:'i',conferenciaLocal:'escola',conferenciaEscolaAvulsa:'',
  conferenciaItensLiveRef:{current:[item]},fotosLancadasConferenciaRef:launched,lancamentosFotoConferenciaRef:refs,
  getDataOperationalTruth:()=>({fichaCorrida:[]}),getData:()=>({fichaCorrida:[]}),
  fichaJaTemLancamentoFoto:()=>false,isDivisaoEntregaHabilitada:()=>false,
  resolveConferenciaItensLive:r=>r.current,calcularItensNota:itens=>({itens,valorLiquido:33.25}),
  setFotosLancadasUi:()=>{},resolverDivisaoConferencia:()=>{},
  conferenciaCheckpointKey,getConferenciaDraftMemoria:()=>draft,
  salvarConferenciaCheckpoint:(k,d)=>salvarConferenciaCheckpoint(k,d,storage),
  persistirDraftConferenciaEmMemoria(){draft={notaId:selectedNota.id,updatedAt:Date.now(),instId:'i',local:'escola',descontoPct:5,cooperadoId:'c',divisaoQtd:0,divisaoIds:[],escolaAvulsa:'',numeroNotaManual:'',fotoIdx:0,itens:[item],fotosLancadas:[...launched.current],lancamentosPorFoto:Object.fromEntries(refs.current)};}
};
vm.createContext(ctx);
const js=ts.transpileModule(callback+'\nglobalThis.launch=lancarFotoConferenciaAtual;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
vm.runInContext(js,ctx);
for(let i=0;i<49;i++)assert.equal(ctx.launch(i,50,{uiFirst:true}).ok,true);
assert.equal(writes,49);
assert.equal(ctx.launch(48,50).ok,true);assert.equal(writes,49,'double click does not duplicate');
const recovered=lerConferenciaCheckpoint(key,'nota-a',storage);
assert.equal(recovered.fotosLancadas.length,49);assert.equal(recovered.fotoIdx,49);
assert.equal(recovered.itens.length,0,'next photo has no stale input');
assert.equal(recovered.lancamentosPorFoto[0][0].quantidade,7);
assert.equal(lerConferenciaCheckpoint(conferenciaCheckpointKey('user-b','coop-a','nota-a'),'nota-a',storage),undefined);
assert.equal(lerConferenciaCheckpoint(conferenciaCheckpointKey('user-a','coop-b','nota-a'),'nota-a',storage),undefined);
assert.equal(lerConferenciaCheckpoint(conferenciaCheckpointKey('user-a','coop-a','nota-a','new-cycle'),'nota-a',storage),undefined);
fail=true;assert.equal(ctx.launch(49,50).ok,false);assert.equal(launched.current.has(49),false);assert.equal(refs.current.has(49),false);
assert.equal(lerConferenciaCheckpoint(key,'nota-a',storage).fotosLancadas.length,49,'failed save preserves previous checkpoint');
disk.set(key,'{broken');assert.equal(lerConferenciaCheckpoint(key,'nota-a',storage),undefined);
console.log('PASS: 49 next-photo saves without ficha/cloud writes; refresh recovery, isolated user/cooperative/relaunch, no stale input, double-click idempotence, quota rollback.');
