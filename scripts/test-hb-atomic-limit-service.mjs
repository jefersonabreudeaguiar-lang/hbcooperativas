import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let requestedIds=[];
let cloudZero=false;
let cloudUnavailable=false;
let rpcFailure=false;
const calls=[];
const api={rpc:async(name,body)=>{
  assert.equal(name,'hb_credit_save_limit_batch');calls.push(JSON.parse(JSON.stringify(body)));
  if(rpcFailure)return {data:null,error:{code:'fixture-network'}};
  if(body.p_ids.every(id=>body.p_bases[id]===0) && body.p_percent>0) return {data:{ok:false,error:'Sem lastro na nuvem.'},error:null};
  return {data:{ok:true,updated:body.p_ids.length,accounts:body.p_ids.map(id=>({id:'account',cooperado_id:id,limit_released_cents:700,financial_limit_cap_cents:700,amount_used_cents:200,status:'blocked',has_financial_pin:true,own_balance_cents:100,updated_at:'2026-11-03T12:00:00Z'}))},error:null};
}};
const mocks={
  normalizeCnpj: s=>s.replace(/\D/g,''),
  fetchCooperadosFromStorage: async()=>[{id:'current'},{id:'old'},{id:'other'}],
  resolveAuthoritativeCreditBase:async(_api,_cnpj,ids)=>{
    requestedIds=ids;
    return cloudUnavailable ? {ok:false,code:'OPERACIONAL_UNAVAILABLE',message:'Snapshot indisponível.'} :
      {ok:true,cooperativaId:'coop',creditoBaseAppData:{},creditosBaseCents:{current:cloudZero?0:1000,old:cloudZero?0:1000,other:2000}};
  },
  resolverCooperadoIdCanonico: (_data,id)=>id==='old'?'current':id,
  hbCreditEffectiveDisponivelCents:(limit,cap,used)=>Math.max(0,Math.min(limit,cap)-used),
};
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/hbCreditAtomicLimits.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>mocks});
const save=opts=>exports.saveHbCreditLimitsAtomic(api,'99999999999999','fixture-staff',opts);
const result=await save({cooperadoIds:['old','current'],percentual:70,tetoPercentual:70,creditosBaseCents:{current:99999999}});
assert.equal(result.ok,true);assert.equal(calls.length,1,'Lote usa uma única RPC, sem gravações individuais');
assert.deepEqual(Array.from(requestedIds),['current','old','other'],'Base inclui cooperativa inteira');
assert.deepEqual(calls[0].p_ids,['current'],'Acesso antigo e atual não duplicam conta');
assert.deepEqual(calls[0].p_bases,{current:1000,other:2000},'Base da nuvem, sem duplicar o titular nem aceitar valor do navegador');
assert.equal(result.limites[0].valorUsadoCents,200);assert.equal(result.limites[0].bloqueado,true);assert.equal(result.limites[0].hasFinancialPin,true);
assert.equal((await save({cooperadoIds:['foreign'],percentual:70,tetoPercentual:70})).ok,false);assert.equal(calls.length,1);
cloudZero=true;
assert.equal((await save({cooperadoIds:['current'],percentual:70,tetoPercentual:70,creditosBaseCents:{current:99999999}})).ok,false);
assert.equal(calls.at(-1).p_bases.current,0,'Zero real não vira valor enviado pelo navegador');
cloudZero=false;cloudUnavailable=true;
const count=calls.length;assert.equal((await save({cooperadoIds:['current'],percentual:70,tetoPercentual:70})).ok,false);assert.equal(calls.length,count);
cloudUnavailable=false;rpcFailure=true;
const unknown=await save({cooperadoIds:['current'],percentual:70,tetoPercentual:70});assert.equal(unknown.ok,false);assert.match(unknown.error,/conferir o resultado/);
rpcFailure=false;
await save({cooperadoIds:[],tetoPercentual:80,preservarPercentual:true});assert.equal(calls.at(-1).p_keep_policy,true);assert.deepEqual(calls.at(-1).p_ids,[]);
await save({cooperadoIds:['current'],valorFixoCents:500,preservarPercentual:true});assert.equal(calls.at(-1).p_fixed_cents,500);assert.equal(calls.at(-1).p_percent,null);
console.log('PASS: base de toda a cooperativa, titular deduplicado, seleção isolada, zero real, falha de nuvem/RPC e uma gravação atômica por comando.');

// A API mantém as barreiras de cooperativa/perfil e encaminha as quatro ações à RPC.
let denied='';let saves=0;
const routeExports={};
const routeMocks={
  NextResponse:{json:(body,init={})=>({status:init.status??200,body})},
  requireCreditApi:async()=>({ok:true,ctx:{supabase:api,session:{sub:'fixture-staff',cooperativaCnpj:'99999999999999'}}}),
  requireCreditCnpj:()=>denied==='coop'?{status:403}:null,
  requireCreditStaff:()=>denied==='role'?{status:403}:null,
  normalizeCnpj:mocks.normalizeCnpj,
  validateCreditosBaseCents:()=>({ok:true,sanitized:{}}),
  reaisToCents:value=>Math.round(value*100),
  saveHbCreditLimitsAtomic:async()=>{saves++;return{ok:true,updated:1,creditosBaseCents:{current:1000},limites:[{cooperadoId:'current'}]};},
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/credit/limites/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:routeExports,require:()=>routeMocks,Request,URL,console});
for(const action of ['salvar_liberacao_percentual','set_teto','set_individual','set_coletivo']){
  const body={action,cooperadoIds:['current'],cooperadoId:'current',percentual:70,tetoPercent:70,novoLimiteCentavos:500};
  const request=()=>new Request('https://fixture.invalid/api/credit/limites',{method:'POST',body:JSON.stringify(body)});
  denied='role';assert.equal((await routeExports.POST(request())).status,403);
  denied='coop';assert.equal((await routeExports.POST(request())).status,403);
  denied='';const r=await routeExports.POST(request());assert.equal(r.status,200);assert.equal(r.body.ok,true);
}
assert.equal(saves,4,'Nenhuma ação sem autorização chega à gravação');
console.log('PASS: quatro ações da API usam salvamento atômico após conferir cooperativa e perfil.');
