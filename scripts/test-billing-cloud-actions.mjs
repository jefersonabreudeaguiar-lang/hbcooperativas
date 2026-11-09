import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let role='responsavel', writes=0, reads=0, conflict=false, unavailable=false;
const cob={cicloInicioEm:'2026-01-20',statusMes:'cobranca_enviada',historico:[]};
const client={from(){let mutation=false;const q={select(){return q},eq(){return q},update(){mutation=true;return q},async maybeSingle(){if(mutation){writes++;return {data:conflict?null:{id:'fixture'},error:null}} reads++;return {data:{id:'fixture',cnpj:'88888888000181',cobranca_saas:cob,updated_at:'revision'},error:null}}};return q}};
const deps={
 'next/server':{NextResponse:{json:(body,o={})=>({body,status:o.status??200,headers:o.headers})}},
 '@/lib/security/apiGuard':{guardCooperativaApi:async(req,cnpj)=>role==='none'?{ok:false,response:{status:401}}:cnpj!=='88888888000181'&&role!=='admin'?{ok:false,response:{status:403}}:{ok:true,session:{role,name:'Fixture'},enforced:true},requireAdminRole:session=>session.role==='admin'?null:{status:403}},
 '@/lib/supabase/admin':{getSupabaseAdmin:()=>client},
 '@/utils/cooperativa':{normalizeCnpj:s=>s.replace(/\D/g,'')},
 '@/lib/supabase/platformSettingsStorage':{fetchCobrancaSaasPlatformSettings:async()=>{if(unavailable)throw Error('offline');return {precoCooperado:14.9,minimoMes:290}}},
 '@/lib/billing/platformBillingRead':{readBillingMembers:async()=>[],billingData:()=>({cooperativas:[{id:'fixture',cobrancaSaas:cob}]})},
 '@/services/cobrancaSaasService':Object.fromEntries(['confirmarPagamentoCobrancaSaas','rejeitarPagamentoCobrancaSaas','registrarCobrancaSaas','responsavelInformouPagamentoSaas'].map(k=>[k,data=>({ok:true,data})])),
};
Object.assign(deps['@/services/cobrancaSaasService'],{ensureCobrancaPeriodoAtualSaas:data=>({data}),getPeriodoCobrancaSaasAberto:()=>({periodoId:'2026-10-20'}),enviarAvisoBloqueioCobrancaSaas:d=>d,bloquearTemporarioCobrancaSaas:d=>d,desbloquearCobrancaSaas:d=>d});
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/cobranca-saas/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,require:name=>{if(!(name in deps))throw Error(name);return deps[name]}});
const post=(action,periodoId='2026-10-20',cnpj='88888888000181')=>exports.POST({json:async()=>({action,periodoId,cnpj})});
assert.equal((await post('confirmar')).status,403);assert.equal(writes,0);assert.equal(reads,0);
assert.equal((await post('informar',undefined,'11111111000111')).status,403);
assert.equal((await post('informar','2026-09-20')).status,409);assert.equal(writes,0);
assert.equal((await post('informar','')).status,400);
assert.equal((await post('informar')).status,200);assert.equal(writes,1);
role='admin';conflict=true;assert.equal((await post('confirmar')).status,409);
conflict=false;unavailable=true;const before=writes;assert.equal((await post('confirmar')).status,503);assert.equal(writes,before);
unavailable=false;assert.equal((await post('confirmar')).status,200);
role='none';assert.equal((await post('informar')).status,401);
console.log('ok: billing actions enforce role, tenant, exact cycle, cloud availability and concurrent revision; no real credentials');
