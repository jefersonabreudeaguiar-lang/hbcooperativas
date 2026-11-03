import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

let connections = 0;
class ForbiddenLegacyConnection {
  constructor() { connections++; }
  async connect() { throw Error('No database connection allowed in this test'); }
  async end() {}
}
for (const [file, fn] of [
  ['hbCreditCooperadoTransferSchema.ts', 'applyHbCreditCooperadoTransferSchemaSql'],
  ['hbCreditRefundFixSchema.ts', 'applyHbCreditRefundFixSchemaSql'],
  ['hbCreditPhase1SecuritySchema.ts', 'applyHbCreditPhase1SecuritySchemaSql'],
  ['hbCreditPartnersSchema.ts', 'applyHbCreditPartnersSchemaSql'],
]) {
  const exports = {};
  const source = fs.readFileSync(`src/lib/supabase/${file}`, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
    exports,
    process: {env: {NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture'}, cwd: () => process.cwd()},
    require: name => {
      if (name === 'pg') return {default: {Client: ForbiddenLegacyConnection}};
      if (name === 'node:fs') return {...fs, existsSync: () => false};
      if (name === 'node:path') return path;
      throw Error(`Unexpected dependency: ${name}`);
    },
  });
  const result = await exports[fn]();
  assert.equal(result.ok, false);
  assert.equal(connections, 0, 'Reparo antigo não pode abrir conexão para sobrescrever as regras novas');
  assert.match(result.error, /desativado/i);
  if (exports.ensureHbCreditPartnersSchema) {
    const client = error => ({from: () => ({select: () => ({limit: async () => ({error})})})});
    assert.equal((await exports.ensureHbCreditPartnersSchema(client(null))).ok, true, 'Cadastro já configurado continua disponível');
    const missing = await exports.ensureHbCreditPartnersSchema(client({message:'missing'}));
    assert.equal(missing.ok, false);
    assert.doesNotMatch(missing.hint, /APPLY_HB_CREDIT_COMPLETO/);
    assert.equal(connections, 0);
  }
  if (exports.humanizeCreditRefundError) {
    assert.doesNotMatch(exports.humanizeCreditRefundError('23505 payment_intent_id already exists'), /20260916200000/);
  }
}
for (const route of ['apply-hb-credit-cooperado-transfer-schema', 'apply-hb-credit-refund-fix', 'apply-hb-credit-phase1-security-schema', 'apply-hb-credit-partners-schema']) {
  const exports = {};
  const source = fs.readFileSync(`src/app/api/admin/${route}/route.ts`, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
    exports,
    require: name => {
      if(name === 'next/server') return {NextResponse: {json: (body, init = {}) => ({body, status: init.status ?? 200})}};
      if(name.endsWith('/security/env')) return {getAuthSecret: () => 'fixture-setup-secret'};
      if(name.endsWith('/supabase/admin')) return {getSupabaseAdmin: () => {throw Error('POST não deve acessar banco');}, isSupabaseConfigured: () => {throw Error('POST não deve acessar banco');}};
      return {};
    },
  });
  assert.equal((await exports.POST(new Request('https://fixture.invalid', {method:'POST'}))).status, 401);
  assert.equal((await exports.POST(new Request('https://fixture.invalid', {method:'POST', headers:{'x-setup-secret':'fixture-setup-secret'}}))).status, 410);
}
console.log('PASS: reparos financeiros antigos recusados antes de ler credenciais/conectar; orientação de estorno não recomenda SQL obsoleto.');
