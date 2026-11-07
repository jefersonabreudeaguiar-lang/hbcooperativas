/** Real HTTP authorization regression, only homolog and a disposable synthetic account. */
import assert from 'node:assert/strict';
import { readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
const require = createRequire(import.meta.url);
const env = parseEnv(readFileSync('../../.env.homolog.local', 'utf8'));
const expectedUrl = 'https://ocyfzramxvxqbtkorubn.supabase.co';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, expectedUrl);
const client = createClient(expectedUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = 'hb_release_797_http_fixture';
const cnpj = '88888888000181';
const coopId = 'b32a0001-0001-4001-8001-000000000001';
const email = `${id}@example.invalid`;
const password = randomBytes(24).toString('base64url');
const results = [];
const check = r => { if (r.error) throw Error(r.error.message); return r.data; };
let server, log, created = false;
const base = 'http://127.0.0.1:3027';
async function req(path, cookie, body) {
  const started = performance.now();
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(90000) });
  const data = await r.json();
  results.push({ path: path.split('?')[0], status: r.status, ms: Math.round(performance.now() - started) });
  return { status: r.status, data, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
try {
  assert.equal(check(await client.from('app_users').select('id').eq('id', id)).length, 0, 'Inspect leftover fixture before running');
  check(await client.from('app_users').insert({ id, email, name: '797 HTTP synthetic test', role: 'responsavel', active: true,
    cooperativa_id: coopId, cooperativa_cnpj: cnpj, responsavel_principal: true,
    password_hash: await bcrypt.hash(password, 10) }));
  created = true;
  log = openSync('.tmp-release-797-http-server.log', 'w');
  const serverEnv = { ...process.env, ...env, AUTH_SECRET: randomBytes(48).toString('base64url'), NODE_ENV: 'development',
    HB_STAFF_MFA_REQUIRED: 'false', HB_HOMOLOGATION_ONLY: 'true' };
  delete serverEnv.HB_OPERACIONAL_VERSIONED_SYNC;
  server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3027'],
    { env: serverEnv, stdio: ['ignore', log, log], windowsHide: true });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Test server stopped');
    try { const r = await fetch(base + '/api/client-release', { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'Test server did not start');
  assert.equal((await req(`/api/cooperativa-sync?cnpj=${cnpj}`)).status, 401);
  const login = await req('/api/auth/login', null, { email, password });
  assert.equal(login.status, 200); assert.ok(login.cookie);
  const cookie = login.cookie;
  assert.equal((await req('/api/auth/session', cookie)).status, 200);
  assert.equal((await req(`/api/cooperativa-sync?cnpj=${cnpj}`, cookie)).status, 200);
  assert.equal((await req('/api/cooperativa-sync?cnpj=99999999999998', cookie)).status, 403);
  assert.equal((await req('/api/cooperativa-sync', cookie, { cnpj: '99999999999998', section: 'operacional', payload: {} })).status, 403);
  check(await client.from('app_users').update({ active: false }).eq('id', id));
  assert.equal((await req(`/api/cooperativa-sync?cnpj=${cnpj}`, cookie)).status, 401);
  assert.equal((await req('/api/auth/session', cookie)).status, 401);
  check(await client.from('app_users').update({ active: true, cooperativa_cnpj: '99999999999998' }).eq('id', id));
  assert.equal((await req('/api/auth/session', cookie)).status, 401);
  assert.equal((await req(`/api/cooperativa-sync?cnpj=${cnpj}`, cookie)).status, 401);
  console.log('PASS: real HTTP login, tenant boundaries, deactivation and identity rebinding. No financial write.');
} finally {
  if (created) {
    check(await client.from('app_users').update({ active: false, password_hash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10) }).eq('id', id));
    check(await client.from('app_users').delete().eq('id', id));
    assert.equal(check(await client.from('app_users').select('id').eq('id', id)).length, 0);
  }
  if (server) { server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 5000); } }); }
  if (log !== undefined) closeSync(log);
  writeFileSync('.tmp-release-797-http-result.json', JSON.stringify({ project: 'ocyfzramxvxqbtkorubn', build: 797, results, fixtureRemoved: created }, null, 2));
}
