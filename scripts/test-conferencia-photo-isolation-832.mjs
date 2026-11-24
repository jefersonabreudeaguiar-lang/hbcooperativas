import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {hookHarness,virtualTimers} from './helpers/hook-effect-harness.mjs';
import {calcularTotaisConferenciaItens} from '../src/lib/conferencia/conferenciaItensLive.ts';

const h=hookHarness(),timers=virtualTimers(),exports={},transitions=[];
const react={...h.react,startTransition:fn=>transitions.push(fn)};
const deps={'react':react,'react/jsx-runtime':jsx,'next/link':()=>null,'@/components/ui/AlertBanner':{AlertBanner:()=>null},'@/utils/format':{cn:(...s)=>s.filter(Boolean).join(' '),formatCurrency:String},'@/utils/unidades':{labelUnidade:s=>s},'@/utils/fotoEntrega':{contarFotosEnviadasNota:()=>3},'@/lib/conferencia/conferenciaItensLive':{calcularTotaisConferenciaItens},'@/components/notas/ConferenciaQuantidadeInput':{ConferenciaQuantidadeInput:()=>null}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(process.argv[2]??'src/components/notas/NotasPedidoConferirItensTable.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,...timers,require:name=>deps[name]});
const base=[{produtoInstituicaoId:'melancia',produtoNome:'Melancia',unidade:'un',quantidade:0,precoUnitario:10}];
let live=base,commits=0;
let props={selectedNota:{id:'nota'},conferenciaInstNome:'Contrato',conferenciaFotoSomenteLeitura:false,conferenciaFotoIdx:0,conferenciaDescontoPct:5,conferenciaItens:base,conferenciaDraftKey:'nota:0:contrato',onDraftLiveChange:v=>{live=v},onDraftCommit:()=>{commits++}};
const render=()=>h.render(()=>exports.NotasPedidoConferirItensTable(props));
function rows(n,out=[]){if(!n||typeof n!=='object')return out;if(n.type?.name==='ConferenciaItemQtyRow')out.push(n.props);for(const c of [n.props?.children].flat(Infinity))rows(c,out);return out;}
let tree=render();const oldRow=rows(tree)[0];
oldRow.onLiveQty(0,86);
assert.equal(live[0].quantidade,86,'aprovação lê a quantidade digitada mesmo antes do trabalho de fundo');
const approved=structuredClone(live);
props={...props,conferenciaFotoIdx:1,conferenciaDraftKey:'nota:1:contrato',conferenciaItens:structuredClone(base)};
tree=render();assert.equal(live[0].quantidade,0);
while(transitions.length)transitions.shift()();
tree=render();
oldRow.onCommitQty(0,86);timers.flushTimers();timers.flushIdle();tree=render();
assert.equal(live[0].quantidade,0,'blur antigo não preenche a foto seguinte');
assert.equal(rows(tree)[0].item.quantidade,0,'render atrasado não restaura a quantidade anterior');
assert.equal(calcularTotaisConferenciaItens(live,5).bruto,0);
assert.equal(commits,0,'nenhum rascunho antigo foi confirmado na foto seguinte');
assert.equal(approved[0].quantidade,86,'a quantidade aprovada foi preservada separadamente');
// Returning to a launched photo displays its own saved quantities, not a blank form.
props={...props,conferenciaFotoIdx:0,conferenciaDraftKey:'nota:0:contrato',conferenciaFotoSomenteLeitura:true,conferenciaItens:approved};
tree=render();assert.equal(rows(tree)[0].item.quantidade,86);assert.equal(rows(tree)[0].disabled,true);
for(const path of ['src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx','src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx']){
 const source=fs.readFileSync(path,'utf8');
 assert.match(source,/<NotasPedidoConferirItensTable\s+key=\{`\$\{selectedNota.id\}:\$\{conferenciaFotoIdx\}:\$\{conferenciaInstId\}`\}/,'cada foto/nota/contrato tem uma instância independente');
}
h.cleanup();assert.equal(timers.pending,0);
console.log('PASS: próxima foto vazia, total zero, último dígito preservado, callbacks atrasados bloqueados, retorno à foto aprovada e isolamento por contrato.');
