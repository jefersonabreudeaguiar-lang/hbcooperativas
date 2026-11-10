import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import * as jsx from 'react/jsx-runtime';
import {hookHarness,virtualTimers} from './helpers/hook-effect-harness.mjs';
import {calcularTotaisConferenciaItens,resolveConferenciaItensLive} from '../src/lib/conferencia/conferenciaItensLive.ts';
const h=hookHarness(),timers=virtualTimers(),exports={};
const deps={'react':h.react,'react/jsx-runtime':jsx,'next/link':()=>null,'@/components/ui/AlertBanner':{AlertBanner:()=>null},'@/utils/format':{cn:(...s)=>s.filter(Boolean).join(' '),formatCurrency:String},'@/utils/unidades':{labelUnidade:s=>s},'@/utils/fotoEntrega':{contarFotosEnviadasNota:()=>1},'@/lib/conferencia/conferenciaItensLive':{calcularTotaisConferenciaItens},'@/components/notas/ConferenciaQuantidadeInput':{ConferenciaQuantidadeInput:()=>null}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/notas/NotasPedidoConferirItensTable.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,...timers,require:name=>{if(!(name in deps))throw Error(name);return deps[name]}});
const base=Array.from({length:40},(_,i)=>({produtoInstituicaoId:'p'+i,produtoNome:'Item '+i,unidade:'kg',quantidade:0,precoUnitario:2}));let live=base,commits=0,liveChanges=0,lastCommitted;
let props={selectedNota:{id:'note'},conferenciaInstNome:'Contrato',conferenciaFotoSomenteLeitura:false,conferenciaFotoIdx:0,conferenciaDescontoPct:5,conferenciaItens:base,conferenciaDraftKey:'note:0:contract',onDraftLiveChange:items=>{live=items;liveChanges++;},onDraftCommit:items=>{commits++;lastCommitted=items;}};
const render=()=>h.render(()=>exports.NotasPedidoConferirItensTable(props));
function rows(node,out=[]){if(!node||typeof node!=='object')return out;if(node.type?.name==='ConferenciaItemQtyRow')out.push(node.props);for(const child of [node.props?.children].flat(Infinity))rows(child,out);return out;}
let tree=render();
for(let n=1;n<=100;n++){const before=live;const idx=n%40;rows(tree)[idx].onLiveQty(idx,n+.25);tree=render();assert.equal(commits,0,'typing never commits the whole parent');assert.equal(live[idx].quantidade,n+.25);assert.equal(live[(idx+1)%40],before[(idx+1)%40],'other rows retain identity');const current=live;rows(tree)[idx].onCommitQty(idx,n+.25);tree=render();assert.equal(live,current,'blur of unchanged quantity is a no-op');}
assert.equal(liveChanges,100);assert.equal(timers.pending,1);
assert.equal(resolveConferenciaItensLive({current:live},base)[20].quantidade,100.25,'approve before idle reads the final typed digit');
timers.flushTimers();assert.equal(commits,0,'parent work waits for idle');timers.flushIdle();assert.equal(commits,1);assert.equal(lastCommitted,live);
rows(tree)[0].onLiveQty(0,9);tree=render();props={...props,conferenciaDraftKey:'note:1:other-contract',conferenciaItens:base};tree=render();timers.flushTimers();timers.flushIdle();assert.equal(commits,1,'old photo/contract cannot commit into the next one');assert.equal(live,base);
// Captures receive native focus transitions; the browser still owns Tab order.
const internal={}, external={};const root={contains:target=>target===internal};
tree.props.onFocusCapture();
for(const idx of [0,1,2,3,2,1,0]){
  rows(tree)[idx].onLiveQty(idx,86+idx);
  tree=render();
  timers.flushTimers();timers.flushIdle();
  tree.props.onBlurCapture({currentTarget:root,relatedTarget:internal});
  tree.props.onFocusCapture();
  assert.equal(commits,1,'pausing and moving in either direction inside the table cannot update the parent');
}
assert.equal(resolveConferenciaItensLive({current:live},base)[0].quantidade,86,'immediate approval reads the live value');
tree.props.onBlurCapture({currentTarget:root,relatedTarget:external});
timers.flushTimers();
tree.props.onFocusCapture();timers.flushIdle();
assert.equal(commits,1,'re-entering the table cancels queued parent work');
tree.props.onBlurCapture({currentTarget:root,relatedTarget:external});
timers.flushTimers();timers.flushIdle();assert.equal(commits,2);assert.equal(lastCommitted,live);
tree.props.onFocusCapture();tree.props.onBlurCapture({currentTarget:root,relatedTarget:null});
timers.flushTimers();timers.flushIdle();assert.equal(commits,2,'leaving an unchanged draft does no work');
h.cleanup();assert.equal(timers.pending,0);
const inputHarness=hookHarness(),inputExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/notas/ConferenciaQuantidadeInput.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:inputExports,require:name=>name==='react'?inputHarness.react:name==='react/jsx-runtime'?jsx:{Input:()=>null}});
let committed,typed;const input=inputHarness.render(()=>inputExports.ConferenciaQuantidadeInput({value:0,ariaLabel:'Quantidade',onLiveQty:q=>{typed=q},onCommitQty:q=>{committed=q}}));
input.props.onFocus();input.props.onChange({target:{value:'12.34'}});input.props.onBlur();assert.equal(typed,12.34);assert.equal(committed,12.34,'rapid change/blur before rerender cannot restore stale text');inputHarness.cleanup();
console.log('PASS: 100 quantity edits produce no parent commit while typing or changing fields; one idle commit; final digit and photo/contract boundaries preserved.');
