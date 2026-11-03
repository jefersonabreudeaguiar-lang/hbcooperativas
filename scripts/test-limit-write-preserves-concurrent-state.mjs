import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = fs.readFileSync('src/lib/supabase/contaCoopStorage.ts','utf8');
const mocks = {
  normalizeCnpj: value => value.replace(/\D/g,''),
  hbCreditEffectiveDisponivelCents: (limit, cap, used) => Math.max(0, Math.min(limit, cap ?? limit) - used),
  markHbCreditLimitStale: async () => {},
};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText + '\nexports.manualWrite=writeLimiteCooperadoCents; exports.syncWrite=writeLimiteCooperadoAuthoritativeSync;', {exports,require:()=>mocks,console,setTimeout,clearTimeout});
function fixture({missing=false, readError=false, legacy=false}={}) {
  const row={id:'account',cooperative_cnpj:'99999999999999',cooperado_id:'member',limit_released_cents:1000,amount_used_cents:200,status:'active',own_balance_cents:300,pin_hash:'fixture-hash'};
  const payloads=[];
  let writes=0;
  const client={from: table => {
    if(table==='hb_credit_audit_log') return {insert:async()=>({error:null})};
    assert.equal(table,'hb_credit_accounts');
    const query={select:()=>query,eq:()=>query,maybeSingle:async()=>{
      const before=missing ? null : {...row};
      // A compra e o bloqueio chegam depois da leitura, antes de gravar o limite.
      if(!missing){row.amount_used_cents=700;row.status='blocked';}
      return {data:before,error:readError ? {message:'fixture read unavailable'} : null};
    },upsert: (payload, options) => {
      assert.equal(options.defaultToNull,false,'Conta nova deve usar defaults sem preencher campos protegidos');
      writes++; payloads.push({...payload});
      const fail=legacy && writes===1;
      if(!fail) Object.assign(row,missing ? {amount_used_cents:0,status:'active'} : {},payload);
      return {select:()=>({single:async()=>fail ? {data:null,error:{message:'financial_limit_cap_cents missing'}} : {data:{...row},error:null}})};
    }};
    return query;
  }};
  return {client,row,payloads};
}
for(const kind of ['manual','sync']) for(const legacy of [false,true]) {
  const run=async f => kind==='manual'
    ? exports.manualWrite(f.client,'99999999999999','member',1500,'fixture-actor',{novo:{limiteLiberadoCents:1500}})
    : exports.syncWrite(f.client,'99999999999999','member',{limitReleasedCents:1500,baseSnapshotCents:3000,ceilingSnapshotCents:2100,actorUserId:'fixture-actor',auditMetadata:{}});
  const f=fixture({legacy}); const result=await run(f);
  assert.equal(result.ok,true);
  assert.equal(f.row.amount_used_cents,700,'Gravar limite não pode apagar a compra concorrente');
  assert.equal(f.row.status,'blocked','Gravar limite não pode desfazer bloqueio concorrente');
  assert.equal(f.row.own_balance_cents,300);
  assert.equal(result.limite.valorUsadoCents,700);
  assert.equal(result.limite.bloqueado,true);
  for(const payload of f.payloads) for(const field of ['amount_used_cents','status','own_balance_cents','pin_hash']) assert.equal(field in payload,false);
  const fresh=fixture({missing:true}); assert.equal((await run(fresh)).ok,true);
  assert.equal(fresh.row.amount_used_cents,0);
  assert.equal(fresh.row.status,'active');
  const unavailable=fixture({readError:true}); assert.equal((await run(unavailable)).ok,false);
  assert.equal(unavailable.payloads.length,0,'Leitura indisponível não autoriza gravação');
}
console.log('PASS: limite manual/sync e fallback preservam compra, bloqueio, PIN e saldo próprio; conta nova usa defaults; erro de leitura impede gravação.');
