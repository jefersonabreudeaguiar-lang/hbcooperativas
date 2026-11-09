import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, URL, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; } });
  return exports;
}
const projection = load('src/lib/hb-credit/hbFinanceiroPendentes.ts', {});
let active = true, unavailable = false, reads = 0;
const row = { hbTransactionId: 'settled', cooperadoId: 'member', eventType: 'PAYMENT', createdAt: '2026-11-05', valorImpactoAReceberReais: -100 };
const payment = { id: 'paid', cooperadoId: 'member', status: 'confirmado', pagoEm: '2026-11-06', descontosExtras: [{ tipo: 'conta_coop', valor: 100, hbTransactionId: 'settled' }] };
const route = load('src/app/api/credit/utilizacao-resumo/route.ts', {
  'next/server': { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status ?? 200, headers: opts.headers }) } },
  '@/lib/supabase/contaCoopStorage': { listCooperadoHbUtilizacaoResumoAbateValorReceber: async () => [row] },
  '@/lib/hb-credit/utilizacaoResumo': { enriquecerSaldosHbUtilizacao: rows => rows },
  '@/lib/security/creditGuard': { requireCreditApi: async () => active ? { ok: true, ctx: { supabase: {}, enforced: true, session: { role: 'cooperado', cooperadoId: 'member' } } } : { ok: false, response: { status: 401 } },
    requireCreditCnpj: () => null, requireCreditCooperado: () => null },
  '@/lib/supabase/cooperativaSyncStorage': { fetchOperacionalSync: async () => { reads++; return unavailable ? null : { pagamentosCooperado: [payment] }; } },
  '@/lib/hb-credit/hbFinanceiroPendentes': projection,
});
const url = 'https://fixture.invalid/api/credit/utilizacao-resumo?cnpj=88888888000181&cooperadoId=member&mesReferencia=2026-10';
let response = await route.GET({ url });
assert.equal(response.body.lancamentos.length, 1, 'Default historical query remains unchanged'); assert.equal(reads, 0);
response = await route.GET({ url: url + '&somentePendentes=true' });
assert.equal(response.status, 200); assert.equal(response.body.lancamentos.length, 0);
assert.equal(response.headers['Cache-Control'], 'private, no-store');
unavailable = true;
assert.equal((await route.GET({ url: url + '&somentePendentes=true' })).status, 503, 'Do not show settled items as pending when payment proof is unavailable');
active = false;
const before = reads;
assert.equal((await route.GET({ url: url + '&somentePendentes=true' })).status, 401); assert.equal(reads, before);
console.log('PASS: open HB API projects paid movements out, keeps historical query unchanged, enforces session and fails closed on payment-read failure.');
