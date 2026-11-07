import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
const env = {};
let configured = false;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/security/env.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, process: { env }, require: name => {
  assert.equal(name, '@/lib/supabase/admin'); return { isSupabaseConfigured: () => configured };
} });
for (const cloud of [false, true]) for (const secret of [undefined, '', 'fixture']) {
  configured = cloud; env.AUTH_SECRET = secret; env.NODE_ENV = 'production';
  assert.equal(exports.isApiSecurityEnforced(), true);
  if (!secret) assert.throws(() => exports.getAuthSecret(), /obrigatório/);
}
env.NODE_ENV = 'development'; env.AUTH_SECRET = undefined; configured = false;
assert.equal(exports.isApiSecurityEnforced(), false);
console.log('PASS: produção nunca desativa autorização por ausência de banco ou segredo; desenvolvimento local preservado.');
