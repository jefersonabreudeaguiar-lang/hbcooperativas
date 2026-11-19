const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');

async function exercise(guard, row, dbError = null) {
  let reads = 0;
  const chain = {
    select() { return this; }, eq(key, value) { assert.equal(key, 'cnpj'); assert.equal(value, '62351750000165'); return this; },
    async maybeSingle() { return { data: row, error: dbError }; },
  };
  const imports = {
    'next/server': { NextResponse },
    '@/lib/security/apiGuard': { guardCooperativaApi: async (_r, cnpj) => { assert.equal(cnpj, '62351750000165'); return guard; } },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from(table) { assert.equal(table, 'cooperativas'); reads++; return chain; } }) },
    '@/utils/cooperativa': { normalizeCnpj: value => value.replace(/\D/g, '') },
    '@/utils/mensalidadeConfigPublica': require('../src/utils/mensalidadeConfigPublica.ts'),
  };
  const source = fs.readFileSync('src/app/api/cooperativas/[cnpj]/perfil/route.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { exports: mod.exports, require: id => { assert.ok(imports[id], id); return imports[id]; } });
  const response = await mod.exports.GET(new Request('https://example.test/api/cooperativas/62351750000165/perfil'), { params: Promise.resolve({ cnpj: '62.351.750/0001-65' }) });
  return { response, reads };
}
(async () => {
  const row = { id: 'coop', cnpj: '62351750000165', mensalidade_config: { valorPadrao: 30, mesesCobranca: ['2026-10', '2026-11'], senhaAreaAdminHash: 'segredo' } };
  const allowed = await exercise({ ok: true, session: { role: 'cooperado' } }, row);
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get('cache-control'), 'private, no-store');
  const body = await allowed.response.json();
  assert.deepEqual(body.cooperativa.mensalidade_config.mesesCobranca, ['2026-10', '2026-11']);
  assert.ok(!JSON.stringify(body).includes('segredo'));
  for (const guard of [
    { ok: false, response: NextResponse.json({ error: 'Outro CNPJ' }, { status: 403 }) },
    { ok: true, session: null },
    { ok: true, session: { role: 'parceiro' } },
  ]) {
    const denied = await exercise(guard, row);
    assert.ok([401, 403].includes(denied.response.status));
    assert.equal(denied.reads, 0);
  }
  assert.equal((await exercise({ ok: true, session: { role: 'cooperado' } }, null, { message: 'timeout' })).response.status, 503);
  console.log('PASS: perfil com dois meses, no-store, segredos omitidos, negação antes da consulta e indisponibilidade.');
})();
