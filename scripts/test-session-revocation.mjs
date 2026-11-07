import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Request, require: name => {
    if (Object.hasOwn(deps, name)) return deps[name];
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return exports;
}
const users = load('src/lib/supabase/usersAuth.ts', {
  '@/utils/cooperativa': { normalizeCnpj: x => x.replace(/\D/g, '') },
  '@/lib/security/appCreator': {}, '@/lib/security/password': {}, '@/lib/security/fieldCrypto': {},
});
const { resolveCurrentSession } = load('src/lib/security/currentSession.ts', {
  '@/lib/supabase/usersAuth': users,
  '@/utils/cooperativa': { normalizeCnpj: x => x.replace(/\D/g, '') },
});
const claims = { sub: 'member', email: 'fixture@example.invalid', name: 'Fixture', role: 'responsavel',
  cooperativaCnpj: '88888888000181', cooperativaId: 'coop-a', mfaVerified: true,
  modoAcesso: 'total', responsavelPrincipal: true };
let row = { id: claims.sub, email: claims.email, name: 'Fixture', role: claims.role,
  cooperativa_cnpj: claims.cooperativaCnpj, cooperativa_id: claims.cooperativaId,
  cooperado_id: null, active: true, modo_acesso: 'parcial', responsavel_principal: false,
  permissoes_negadas: { ficha_corrida: ['edit'] } };
const original = { ...row };
let error = null;
const client = { from: table => {
  assert.equal(table, 'app_users');
  return { select: columns => {
    assert.doesNotMatch(columns, /password|secret|\*/);
    return { eq: (key, value) => {
      assert.equal(key, 'id'); assert.equal(value, claims.sub);
      return { maybeSingle: async () => ({ data: row, error }) };
    } };
  } };
} };
let result = await resolveCurrentSession(client, claims);
assert.equal(result.ok, true);
assert.equal(result.session.modoAcesso, 'parcial');
assert.equal(result.session.responsavelPrincipal, false);
assert.equal(result.session.mfaVerified, false);
assert.equal(result.session.permissoesNegadas.ficha_corrida[0], 'edit');
for (const mutation of [null, { active: false }, { active: null }, { role: 'admin' },
  { cooperativa_cnpj: '99999999000191' }, { cooperativa_id: 'coop-b' },
  { cooperado_id: 'different-member' }, { email: 'other@example.invalid' }]) {
  row = mutation === null ? null : { ...original, ...mutation };
  assert.equal((await resolveCurrentSession(client, claims)).status, 401);
}
row = original; error = { message: 'offline' };
assert.equal((await resolveCurrentSession(client, claims)).status, 503);
error = null;
assert.equal((await resolveCurrentSession(null, claims)).status, 503);
assert.equal((await resolveCurrentSession({ from() { throw Error('offline'); } }, claims)).status, 503);

let cookies = 0;
const next = { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200,
  headers: { append() { cookies++; } } }) } };
const sessionRoute = load('src/app/api/auth/session/route.ts', {
  'next/server': next, '@/lib/supabase/admin': { getSupabaseAdmin: () => client },
  '@/lib/security/jwt': { extractAccessToken: () => 'signed-cookie', verifyAccessToken: async () => claims,
    signAccessToken: async () => 'refreshed-cookie' },
  '@/lib/security/env': { isApiSecurityEnforced: () => true },
  '@/lib/security/sessionCookie': { buildSessionCookieHeader: () => 'fixture' },
  '@/lib/security/rateLimit': { rateLimitAuth: () => true },
  '@/lib/security/authRoutes': { resolveEffectiveAppUserRole: x => x.role },
  '@/lib/supabase/usersAuth': users,
  '@/lib/security/currentSession': { resolveCurrentSession },
});
for (const [value, failure, status] of [[null, null, 401], [{ ...original, active: false }, null, 401],
  [original, { message: 'offline' }, 503], [original, null, 200]]) {
  row = value; error = failure;
  const before = cookies;
  assert.equal((await sessionRoute.GET(new Request('https://fixture.invalid/api/auth/session'))).status, status);
  assert.equal(cookies - before, status === 200 ? 1 : 0, 'Falha não deve renovar o cookie antigo');
}
console.log('PASS: contas removidas/desativadas e vínculos alterados recusados; permissões atuais prevalecem; falha de banco não renova sessão.');
