/** Real HTTP/API/database acceptance. Reserved synthetic tenants only; never loads .env.local. */
import assert from 'node:assert/strict';
import { readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const url = 'https://ocyfzramxvxqbtkorubn.supabase.co';
const cnpjs = ['99999999999994', '99999999999995'];
const prefix = 'hb_scale_acceptance_';
const env = parseEnv(readFileSync('../../.env.homolog.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, url, 'This test only accepts the homolog database');
assert.ok(/^sb_secret_[A-Za-z0-9_-]{25,}$/.test(env.SUPABASE_SERVICE_ROLE_KEY ?? '') ||
  /^eyJ[A-Za-z0-9_.-]{100,}$/.test(env.SUPABASE_SERVICE_ROLE_KEY ?? ''), 'Configure a valid homolog server key');
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const check = result => { if (result.error) throw Error(result.error.message); return result.data; };
const coopIds = cnpjs.map(() => randomUUID());
const userIds = cnpjs.map((_, i) => `${prefix}${i}`);
const password = randomBytes(24).toString('base64url');
const baseUrl = 'http://127.0.0.1:3021';
const samples = [];
let server;
let fixtureCreated = false;
let log;
async function request(path, cookie, body) {
  const start = performance.now();
  const response = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) });
  const data = await response.json();
  samples.push({ path: path.split('?')[0], status: response.status, ms: Math.round(performance.now() - start) });
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  const existing = check(await client.from('cooperativas').select('id').in('cnpj', cnpjs));
  assert.equal(existing.length, 0, 'Reserved tenants already exist; inspect before retrying');
  const snapshots = check(await client.from('hb_operacional_snapshots').select('cooperativa_cnpj').in('cooperativa_cnpj', cnpjs));
  assert.equal(snapshots.length, 0, 'Previous snapshot must be inspected and cleaned before retrying');
  const users = check(await client.from('app_users').select('id').in('id', userIds));
  assert.equal(users.length, 0);
  for (const cnpj of cnpjs) {
    const listed = await client.storage.from('hb-cooperativa-sync').list(cnpj);
    assert.ok(!listed.error && listed.data.length === 0, 'Reserved legacy directory is not empty');
  }
  check(await client.from('cooperativas').insert(cnpjs.map((cnpj, i) => ({ id: coopIds[i], cnpj,
    nome: `${prefix}${i}`, email: `${prefix}${i}@example.invalid`, status: 'ativa' }))));
  fixtureCreated = true;
  const password_hash = await bcrypt.hash(password, 10);
  check(await client.from('app_users').insert(userIds.map((id, i) => ({ id,
    email: `${id}@example.invalid`, password_hash, name: 'Synthetic acceptance', role: 'responsavel',
    cooperativa_cnpj: cnpjs[i], cooperativa_id: coopIds[i], active: true, responsavel_principal: true }))));

  log = openSync('.tmp-scale-http-server.log', 'w');
  const serverEnv = { ...process.env, ...env, AUTH_SECRET: randomBytes(48).toString('base64url'),
    HB_HOMOLOGATION_ONLY: 'true', HB_OPERACIONAL_VERSIONED_SYNC: 'true', HB_OPERACIONAL_VERSIONED_SYNC_CNPJ: cnpjs[0],
    HB_OWNED_BALANCE_OPERATIONS_ENABLED: 'false', NEXT_PUBLIC_COOPERADO_TRANSFERENCIA_CREDITO: 'false',
    NEXT_TELEMETRY_DISABLED: '1', HB_CREDIT_ENABLED: 'true', HB_CREDIT_OPERATIONS_ENABLED: 'true' };
  for (const key of ['DATABASE_URL', 'SUPABASE_DB_PASSWORD', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete serverEnv[key];
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3021'],
    { env: serverEnv, stdio: ['ignore', log, log], windowsHide: true });
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw Error('Acceptance server exited; inspect the server log');
    try { await fetch(baseUrl + '/api/client-release', { signal: AbortSignal.timeout(3000) }); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Server startup timed out');
  const readPath = cnpj => `/api/cooperativa-sync?cnpj=${cnpj}`;
  assert.equal((await request(readPath(cnpjs[0]))).status, 401);
  const sessions = [];
  // Two independent logins for the same tenant, plus a different tenant.
  for (const i of [0, 0, 1]) {
    const login = await request('/api/auth/login', undefined, { email: `${userIds[i]}@example.invalid`, password });
    assert.equal(login.status, 200); assert.ok(login.cookie); sessions.push(login.cookie);
  }
  assert.equal((await request(readPath(cnpjs[1]), sessions[0])).status, 403);
  assert.equal((await request(readPath(cnpjs[0]), sessions[2])).status, 403);
  const [first, second] = await Promise.all(sessions.slice(0, 2).map(cookie => request(readPath(cnpjs[0]), cookie)));
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal(first.data.operacionalRevision, null);
  assert.equal(second.data.operacionalRevision, null);
  const payload = { updatedAt: new Date().toISOString(), arquivosMensais: [], pagamentosCooperado: [],
    comunicados: [], mensalidades: [], descontos: [], fichaCorrida: [], livroCaixa: [], config: { descontoPadraoCooperativa: 5 } };
  const mutation = (name, revision, original = payload) => ({ cnpj: cnpjs[0], section: 'operacional', operacionalRevision: revision,
    payload: { ...original, updatedAt: new Date().toISOString(), comunicados: [...original.comunicados,
      { id: `${prefix}${name}`, cooperativaId: coopIds[0], titulo: name, mensagem: name, createdAt: new Date().toISOString() }] } });
  assert.equal((await request('/api/cooperativa-sync', sessions[2], mutation('forbidden', null))).status, 403);
  const race = await Promise.all(sessions.slice(0, 2).map((cookie, i) => request('/api/cooperativa-sync', cookie, mutation(`writer${i}`, null))));
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  const loser = race.findIndex(r => r.status === 409);
  const latest = await request(readPath(cnpjs[0]), sessions[loser]);
  assert.equal(latest.status, 200);
  const retry = await request('/api/cooperativa-sync', sessions[loser], mutation(`writer${loser}`, latest.data.operacionalRevision, latest.data.operacional));
  assert.equal(retry.status, 201);
  const final = await request(readPath(cnpjs[0]), sessions[0]);
  assert.equal(final.data.operacional.comunicados.length, 2, 'Both independent edits must survive');
  assert.equal((await request('/api/cooperativa-sync', sessions[0], mutation('stale', null))).status, 409);
  // Revocation must apply to the old cookie without waiting for expiry or a page reload.
  check(await client.from('app_users').update({ active: false }).eq('id', userIds[0]));
  assert.equal((await request(readPath(cnpjs[0]), sessions[0])).status, 401);
  assert.equal((await request('/api/auth/session', sessions[1])).status, 401);
  check(await client.from('app_users').update({ active: true, cooperativa_id: coopIds[1], cooperativa_cnpj: cnpjs[1] }).eq('id', userIds[0]));
  assert.equal((await request(readPath(cnpjs[0]), sessions[0])).status, 401);
  assert.equal((await request(readPath(cnpjs[1]), sessions[0])).status, 401);
  writeFileSync('docs/SCALE-HTTP-ACCEPTANCE.json', JSON.stringify({ recordedAt: new Date().toISOString(),
    environment: 'homolog-only', productionChanged: false, passed: true,
    checks: ['real-login', 'independent-sessions', 'two-tenant-denial', 'concurrent-cas-201-409', 'retry-preserves-both',
      'stale-revision-denied', 'immediate-deactivation', 'tenant-rebinding-requires-login'],
    samples, limitation: 'Development server API test; not a browser, load benchmark or complete financial acceptance.' }, null, 2));
  console.log('PASS: login real, isolamento em duas cooperativas, corrida 201/409, reenvio sem perda e revogação imediata.');
} finally {
  if (server) server.kill();
  if (log !== undefined) closeSync(log);
  if (fixtureCreated) {
    // Disable access even if subsequent cleanup fails. Snapshots require privileged SQL cleanup.
    check(await client.from('app_users').update({ active: false, password_hash: await bcrypt.hash(randomBytes(32).toString('hex'), 10) }).in('id', userIds));
    check(await client.from('app_users').delete().in('id', userIds));
    check(await client.from('cooperativas').delete().in('id', coopIds));
    console.log('Synthetic logins removed. Inspect and remove only reserved snapshots 99999999999994/95 through administrative SQL. Audit events are retained.');
  }
}
