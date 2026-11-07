import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const api = {};
let after = {valorDisponivelCents:200,saldoProprioDisponivelCents:500};
let pinOk = true;
let writes = 0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/supabase/cooperadoTransferenciaCreditoStorage.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText, {exports:api, require:name => {
  if (name.endsWith('cooperadoTransferenciaCredito')) return {isCooperadoTransferenciaCreditoEnabled:()=>true};
  if (name.endsWith('hbOwnedBalanceRollout')) return {isHbOwnedBalanceOperationsReady:()=>true};
  if (name.endsWith('contaCoopStorage')) return {
    verifyFinancialPin:async()=>({ok:pinOk,error:'PIN incorreto'}),
    getLimiteCooperado:async(_sb,_cnpj,_id,options)=>{
      assert.equal(options.skipAmountUsedReconcile,true);
      if (!after) throw Error('leitura indisponível');
      return after;
    },
  };
  if (name.endsWith('/cooperativa')) return {normalizeCnpj:v=>v};
  if (name.endsWith('hbCreditUsoDescricao')) return {nomeDestinoHbUso:v=>v,formatHbCreditUsoMotivo:()=> 'Transferência de teste'};
  return {};
}});
const client = {
  rpc:async()=>{writes++;return {data:{ok:true,receipt_code:'TESTE',disponivel_apos_centavos:700},error:null};},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{receiver_cooperado_id:'',credit_debited_cents:100},error:null})})})}),
};
const input={cooperativeCnpj:'88888888000181',payerCooperadoId:'payer',intentId:'ctrf_test',nonce:'test',pin:'0000',idempotencyKey:'test',actorUserId:'fixture'};
const result=await api.authorizeCooperadoTransferPayment(client,input);
assert.equal(result.ok,true);
assert.equal(result.disponivelAposCents,200,'saldo total do RPC não deve ser tratado como crédito restante');
assert.equal(result.saldoProprioAposCents,500);
assert.equal(result.creditoDebitadoCents,100);
assert.equal(result.disponivelAposCents+result.saldoProprioAposCents,700);
after=null;
const fallback=await api.authorizeCooperadoTransferPayment(client,input);
assert.equal(fallback.ok,true,'falha de releitura não pode desfazer confirmação');
assert.equal(fallback.receiptCode,'TESTE');
assert.equal(fallback.disponivelAposCents,undefined,'sem inventar saldo quando a consulta falha');
pinOk=false;
assert.equal((await api.authorizeCooperadoTransferPayment(client,input)).ok,false);
assert.equal(writes,2,'PIN recusado não executa transferência');
console.log('PASS: transferência confirmada conserva crédito e saldo próprio separados; falha de leitura mantém comprovante; PIN inválido não grava.');

const transferRows = [
  {id:'legacy-compensated',amount_cents:1000,credit_debited_cents:null,description:'Destino fictício'},
  {id:'new-credit',amount_cents:1000,credit_debited_cents:200,description:'Destino fictício'},
  {id:'new-own-only',amount_cents:1000,credit_debited_cents:0,description:'Destino fictício'},
];
const query = {
  select(){return this;},eq(){return this;},in(){return this;},gte(){return this;},
  lte:async()=>({data:transferRows,error:null}),
};
const debits=await api.listTransferenciasUsoComoDescontosFicha({from:()=>query},input.cooperativeCnpj,'payer','2026-11-01','2026-12-01',{requireExplicitCreditDebit:true});
assert.equal(debits.length,1);
assert.equal(debits[0].hbTransactionId,'new-credit');
assert.equal(debits[0].valorReais,2,'somente crédito realmente usado entra no desconto');
assert.equal(debits.some(r=>r.hbTransactionId==='legacy-compensated'),false,'não reconstruir o repasse antigo compensado manualmente');
console.log('PASS: repasse novo abate apenas o crédito usado; saldo próprio e repasse legado compensado não viram novo desconto.');
