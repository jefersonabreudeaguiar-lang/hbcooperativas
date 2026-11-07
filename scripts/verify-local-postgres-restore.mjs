/** Read-only cloud export -> encrypted archive -> disposable loopback PostgreSQL. No paid project. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';
import { sealStorageBytes, openStorageBytes } from './lib/storage-archive.mjs';
import { wrapBackupKey } from './lib/windows-backup-key.mjs';

const argument = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ref = argument('project-ref');
const envFile = argument('env-file');
assert.ok(['ocyfzramxvxqbtkorubn', 'ifptyzikekrswippzmsf'].includes(ref) && envFile,
  'Explicit project and environment file required');
const env = parseEnv(await readFile(resolve(envFile), 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
assert.ok(env.SUPABASE_DB_PASSWORD, 'Database password required; API key is not a database password');
const root = resolve('.tmp-restore-local');
const bin = join(root, 'edb/pgsql/bin');
const caPath = join(root, 'supabase-ca.crt');
const runId = randomBytes(8).toString('hex');
const cluster = join(root, `cluster-${runId}`);
const dataDir = join(cluster, 'data');
const resumeDir = argument('archive-dir');
const archiveDir = resumeDir ? resolve(resumeDir) : resolve('backups', ref, `postgres-local-${runId}`);
assert.ok(archiveDir.startsWith(resolve('backups', ref) + sep), 'Archive must stay in this project backup directory');
const password = randomBytes(32).toString('base64url');
const key = resumeDir ? wrapBackupKey(await readFile(join(archiveDir, 'recovery.dpapi')), true) : randomBytes(32);
const quote = name => `"${name.replaceAll('"', '""')}"`;
const report = { recordedAt: new Date().toISOString(), projectRef: ref, sourceReadOnly: true,
  paidProjectCreated: false, scope: 'public application schema; not full Supabase infrastructure',
  archiveEncrypted: false, restored: false, contentMatches: false, existingDataPreservedAfterMigrations: false,
  migrationsPassed: [], migrationsSkipped: [], migrationsCommitted: false, sqlTestsPassed: [],
  localDataRemoved: false, keyRecovery: 'same-windows-user-and-machine-only', tables: [] };
let remote, local, server, heartbeat, clusterCreated = false, sourceFailure;
const tasksEnv = { ...process.env };
delete tasksEnv.PGPASSWORD; delete tasksEnv.PGSERVICE; delete tasksEnv.PGSERVICEFILE;
delete tasksEnv.PGOPTIONS; delete tasksEnv.PGSSLMODE; delete tasksEnv.PGSSLROOTCERT;
async function run(name, args, childEnv = {}, input) {
  return new Promise((done, reject) => {
    const child = spawn(join(bin, `${name}.exe`), args, { windowsHide: true, timeout: 180000,
      env: { ...tasksEnv, ...childEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let total = 0, stderr = '';
    child.stdout.on('data', b => {
      total += b.length;
      if (total > 512 * 1024 * 1024) { child.kill(); reject(Error('Export exceeds local validation limit')); }
      else chunks.push(b);
    });
    child.stderr.on('data', b => { if (stderr.length < 50000) stderr += b.toString(); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? done(Buffer.concat(chunks))
      : reject(Error(`${name} failed (${code}): ${stderr.replaceAll(password, '[redacted]').replaceAll(env.SUPABASE_DB_PASSWORD, '[redacted]')}`)));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function fingerprint(client, name, excludeColumns = []) {
  const result = await client.query(`select count(*)::text as count,
    md5(coalesce(string_agg(md5((to_jsonb(t)-$1::text[])::text),'' order by md5((to_jsonb(t)-$1::text[])::text)),'')) as hash
    from public.${quote(name)} t`, [excludeColumns]);
  return result.rows[0];
}
try {
  remote = new pg.Client({ host: `db.${ref}.supabase.co`, port: 5432, database: 'postgres', user: 'postgres',
    password: env.SUPABASE_DB_PASSWORD, ssl: { ca: await readFile(caPath, 'utf8'), rejectUnauthorized: true },
    connectionTimeoutMillis: 30000, keepAlive: true, options: '-c default_transaction_read_only=on' });
  remote.on('error', e => { sourceFailure = e.code ?? 'source_connection_error'; });
  await remote.connect();
  const roles = (await remote.query("select rolname,rolbypassrls from pg_roles where rolname not like 'pg_%' order by rolname")).rows;
  const context = `postgres:${ref}:public`;
  if (resumeDir) {
    const previous = JSON.parse(await readFile(join(archiveDir, 'verification.json'), 'utf8'));
    assert.equal(previous.projectRef, ref);
    assert.equal(previous.archiveEncrypted, true);
    assert.ok(Array.isArray(previous.tables) && previous.tables.length > 0);
    report.tables = previous.tables;
    report.archiveSha256 = previous.archiveSha256;
    report.archiveEncrypted = true;
    await remote.end(); remote = null;
  } else {
  await remote.query('begin isolation level repeatable read read only');
  await remote.query("set local timezone='UTC'; set local statement_timeout='90s'");
  heartbeat = setInterval(() => { remote?.query('select 1').catch(e => { sourceFailure = e.code ?? 'source_connection_error'; }); }, 10000);
  const snapshot = (await remote.query('select pg_export_snapshot() as id')).rows[0].id;
  const tables = (await remote.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => r.tablename);
  console.log(`Read-only consistent export of ${tables.length} application tables.`);
  const dump = await run('pg_dump', ['--no-password', '--format=custom', '--schema=public', '--no-owner', '--lock-wait-timeout=10000',
    '--host', `db.${ref}.supabase.co`, '--port', '5432', '--username', 'postgres', '--dbname', 'postgres', '--snapshot', snapshot],
    { PGPASSWORD: env.SUPABASE_DB_PASSWORD, PGSSLMODE: 'verify-full', PGSSLROOTCERT: caPath,
      PGOPTIONS: '-c default_transaction_read_only=on' });
  assert.ok(dump.subarray(0, 5).equals(Buffer.from('PGDMP')));
  assert.equal(sourceFailure, undefined, 'Source snapshot connection must remain valid');
  for (const table of tables) report.tables.push({ name: table, ...await fingerprint(remote, table) });
  await remote.query('rollback');
  clearInterval(heartbeat); heartbeat = null;
  await remote.end(); remote = null;
  await mkdir(archiveDir, { recursive: true });
  const wrapped = wrapBackupKey(key);
  const recovered = wrapBackupKey(wrapped, true);
  assert.ok(recovered.equals(key)); recovered.fill(0);
  await writeFile(join(archiveDir, 'recovery.dpapi'), wrapped, { flag: 'wx' });
  await writeFile(join(archiveDir, 'database.sealed'), sealStorageBytes(dump, key, context), { flag: 'wx' });
  report.archiveEncrypted = true;
  report.archiveSha256 = createHash('sha256').update(dump).digest('hex');
  dump.fill(0);
  }
  const restoredDump = openStorageBytes(await readFile(join(archiveDir, 'database.sealed')), key, context);
  assert.equal(createHash('sha256').update(restoredDump).digest('hex'), report.archiveSha256);

  await mkdir(cluster, { recursive: false }); clusterCreated = true;
  // Restrict temporary plaintext database files to the current Windows account.
  const account = spawnSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true });
  assert.equal(account.status, 0);
  const acl = spawnSync('icacls.exe', [cluster, '/inheritance:r', '/grant:r', `${account.stdout.trim()}:(OI)(CI)F`],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(acl.status, 0, 'Could not restrict local recovery directory');
  const passwordFile = join(cluster, 'initdb.password');
  await writeFile(passwordFile, password + '\n', { flag: 'wx' });
  try {
    await run('initdb', ['-D', dataDir, '-U', 'postgres', `--pwfile=${passwordFile}`, '--auth=scram-sha-256', '--encoding=UTF8', '--no-locale']);
  } finally { await rm(passwordFile, { force: true }); }
  server = spawn(join(bin, 'postgres.exe'), ['-D', dataDir, '-h', '127.0.0.1', '-p', '54329'],
    { env: tasksEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  server.on('error', () => {});
  for (let i = 0; i < 60; i++) {
    const attempt = new pg.Client({ host: '127.0.0.1', port: 54329, database: 'postgres', user: 'postgres', password, connectionTimeoutMillis: 1000 });
    try { await attempt.connect(); local = attempt; break; }
    catch { await attempt.end(); await new Promise(r => setTimeout(r, 500)); }
  }
  assert.ok(local, 'Local PostgreSQL did not start');
  // Reproduce RLS behavior, but never copy login passwords or grant network logins.
  for (const role of roles) if (role.rolname !== 'postgres') {
    await local.query(`create role ${quote(role.rolname)} nologin ${role.rolbypassrls ? 'bypassrls' : 'nobypassrls'}`);
  }
  await local.query('create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; drop schema public cascade');
  await run('pg_restore', ['--no-owner', '--exit-on-error', '--single-transaction', '--host', '127.0.0.1', '--port', '54329', '--username', 'postgres', '--dbname', 'postgres'],
    { PGPASSWORD: password }, restoredDump);
  restoredDump.fill(0);
  report.restored = true;
  await local.query("set timezone='UTC'; set statement_timeout='90s'; set search_path=public,extensions");
  const restoredTables = (await local.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r => r.tablename);
  assert.deepEqual(restoredTables, report.tables.map(t => t.name).sort(), 'Archive table inventory must be complete');
  for (const entry of report.tables) {
    const result = await fingerprint(local, entry.name);
    assert.equal(result.count, entry.count, `${entry.name}: row count mismatch`);
    assert.equal(result.hash, entry.hash, `${entry.name}: content mismatch`);
  }
  report.contentMatches = true;
  console.log(`Restored and verified exact content of ${report.tables.length} tables in local PostgreSQL.`);
  const beforeColumns = new Map();
  for (const table of report.tables) beforeColumns.set(table.name,
    (await local.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table.name])).rows.map(r => r.column_name));
  // Test migrations against the actual source schema/data, not a hand-built approximation.
  const migrations = (await readdir('supabase/migrations')).filter(n => /^2026110[234].*\.sql$/.test(n)).sort();
  await local.query('begin');
  for (const file of migrations) {
    if (/hb_operacional_snapshot_compare_and_save/.test(file) &&
      (await local.query("select to_regclass('public.hb_operacional_snapshots') as t")).rows[0].t) {
      report.migrationsSkipped.push({ file, reason: 'Snapshot table already exists in source; this is not a fresh-install test of that migration' }); continue;
    }
    if (/hb_operacional_freeze_for_rollback/.test(file) &&
      (await local.query("select 1 from information_schema.columns where table_schema='public' and table_name='hb_operacional_snapshots' and column_name='writes_frozen'")).rowCount) {
      report.migrationsSkipped.push({ file, reason: 'Freeze column already exists in source; this is not a fresh-install test of that migration' }); continue;
    }
    await local.query(await readFile(join('supabase/migrations', file), 'utf8'));
    report.migrationsPassed.push(file);
  }
  await local.query('commit');
  report.migrationsCommitted = true;
  for (const table of report.tables) {
    const columns = (await local.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table.name])).rows.map(r => r.column_name);
    const before = beforeColumns.get(table.name);
    assert.ok(before.every(c => columns.includes(c)), `${table.name}: migration removed an original column`);
    const after = await fingerprint(local, table.name, columns.filter(c => !before.includes(c)));
    assert.equal(after.count, table.count, `${table.name}: migrations changed existing row count`);
    assert.equal(after.hash, table.hash, `${table.name}: migrations changed existing data`);
  }
  report.existingDataPreservedAfterMigrations = true;
  for (const file of (await readdir('supabase/tests')).filter(n => n.endsWith('.sql')).sort()) {
    try {
      await local.query(await readFile(join('supabase/tests', file), 'utf8'));
      report.sqlTestsPassed.push(file);
    } catch (e) {
      await local.query('rollback');
      throw Error(`Local SQL acceptance ${file}: ${e.message}`);
    }
  }
  console.log(`Local migration rehearsal: ${report.migrationsPassed.length} files; SQL tests: ${report.sqlTestsPassed.length}.`);
} finally {
  if (heartbeat) clearInterval(heartbeat);
  if (remote) { try { await remote.query('rollback'); } catch {} await remote.end(); }
  if (local) await local.end();
  if (server && clusterCreated) {
    try { await run('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w', '-t', '30']); } catch { server.kill(); }
  }
  if (clusterCreated) {
    const checked = resolve(cluster);
    assert.ok(checked.startsWith(root + sep) && checked.split(sep).at(-1) === `cluster-${runId}`,
      'Refusing cleanup outside the disposable restore cluster');
    await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    report.localDataRemoved = true;
  }
  if (!clusterCreated) report.localDataRemoved = true;
  key.fill(0);
  await mkdir(archiveDir, { recursive: true });
  await writeFile(join(archiveDir, 'verification.json'), JSON.stringify(report, null, 2));
  // Public evidence contains no table contents, credential, password hash or financial individual amount.
  await writeFile(`docs/LOCAL-RESTORE-${ref}-ACCEPTANCE.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ sourceReadOnly: true, paidProjectCreated: false, restored: report.restored,
    contentMatches: report.contentMatches, localDataRemoved: report.localDataRemoved,
    migrations: report.migrationsPassed.length, sqlTests: report.sqlTestsPassed.length, archiveDir }));
}
