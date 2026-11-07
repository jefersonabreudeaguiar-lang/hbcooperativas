import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const payPage = ts.createSourceFile('page.tsx',fs.readFileSync('src/app/(app)/minha-conta-coop/pagar/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let explicitSubmitCalls = 0;
function inspectSubmit(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'confirmar') {
    explicitSubmitCalls++;
    let owner = node.parent;
    while (owner && !ts.isJsxAttribute(owner)) owner = owner.parent;
    assert.ok(owner && owner.name.getText(payPage) === 'onClick','Digitar um PIN de 4 a 8 dígitos não pode confirmar antes do clique em Pagar');
  }
  ts.forEachChild(node,inspectSubmit);
}
inspectSubmit(payPage);
assert.equal(explicitSubmitCalls,1,'Uma entrada explícita para confirmar o pagamento');
const source = fs.readFileSync('src/services/creditApiService.ts', 'utf8');
let fail = 'getData';
let accepted = true;
let calls = 0;
const mocks = {
  secureApiFetch: async () => { calls++; return new Response(JSON.stringify(accepted ? {ok:true, receiptCode:'ORIGINAL',transacaoId:'tx'} : {ok:false,error:'PIN incorreto'}), {status:accepted ? 200 : 400}); },
  mensagemErroAuthApi: (_status, message) => message,
  notifyHbCreditLimiteSynced: () => { if(fail === 'notify') throw Error('event failed'); },
  isCooperadoTransferIntentId: () => false,
  getData: () => { if(fail === 'getData') throw Error('QuotaExceededError'); return {cooperados:[{id:'member',cooperativaId:'coop'}]}; },
  resolverCooperadoIdCanonico: () => 'member',
  bicCentralMesPrincipalQuantoVouReceber: () => '2026-11',
  aplicarDebitoHbCompraLocal: () => { if(fail !== 'slow') throw Error('QuotaExceededError'); },
  refreshContaCoopValorReceberAfterHbTransaction: () => new Promise(() => {}),
  nomeDestinoHbUso: () => 'Mercado', formatHbCreditUsoMotivo: () => 'Compra',
};
const module = {exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {module,exports:module.exports,require:()=>mocks,Response,setTimeout,console});
const input={cnpj:'99999999999999',cooperadoId:'member',intentId:'intent',nonce:'nonce',pin:'1234',idempotencyKey:'same-key',amountReais:10};
for (fail of ['getData','notify','debit']) {
 const r = await module.exports.authorizeCreditPayment(input);
 assert.equal(r.receiptCode,'ORIGINAL');
 assert.equal(r.syncContaCoop,'pending');
}
assert.equal(calls,3,'Each confirmation calls authorize once');
fail='slow';
const started=Date.now();
assert.equal((await module.exports.authorizeCreditPayment(input)).receiptCode,'ORIGINAL');
assert.ok(Date.now()-started < 2500, 'Uma projeção travada não deve esconder a confirmação');
accepted=false;
await assert.rejects(module.exports.authorizeCreditPayment(input),/PIN incorreto/);
console.log('PASS: confirmação preservada com falha de armazenamento, evento e débito local; PIN recusado nunca vira sucesso.');
