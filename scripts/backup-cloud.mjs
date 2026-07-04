/**
 * Backup completo da nuvem Supabase (tabelas + storage) em backups/<timestamp>/.
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const BUCKETS = ["hb-cooperativa-sync", "hb-cooperados", "hb-entregas"];

function normalizeCnpj(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function writeJson(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2), "utf8");
}

async function listStoragePrefixes(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list("", { limit: 500 });
  if (error || !data?.length) return [];
  return data.map((f) => normalizeCnpj(f.name)).filter((c) => c.length === 14);
}

async function downloadStorageFolder(bucket, prefix, outDir) {
  const { data: files, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !files?.length) return 0;

  let saved = 0;
  for (const file of files) {
    const remotePath = `${prefix}/${file.name}`;
    if (file.id === null && !file.metadata) {
      const sub = await downloadStorageFolder(bucket, remotePath, join(outDir, file.name));
      saved += sub;
      continue;
    }
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(remotePath);
    if (dlErr || !blob) continue;
    const localPath = join(outDir, file.name);
    mkdirSync(outDir, { recursive: true });
    const text = await blob.text();
    try {
      writeJson(outDir, file.name, JSON.parse(text));
    } catch {
      writeFileSync(localPath, text);
    }
    saved += 1;
  }
  return saved;
}

async function fetchTable(name) {
  const { data, error } = await supabase.from(name).select("*");
  if (error) {
    if (error.code === "42P01") return { ok: false, rows: [], error: "tabela inexistente" };
    return { ok: false, rows: [], error: error.message };
  }
  return { ok: true, rows: data ?? [] };
}

const backupRoot = resolve(process.cwd(), "backups", timestamp());
mkdirSync(backupRoot, { recursive: true });

console.log(`Gerando backup em ${backupRoot}...`);

const [cooperativas, notasPedido, appUsers, auditLog] = await Promise.all([
  fetchTable("cooperativas"),
  fetchTable("notas_pedido"),
  fetchTable("app_users"),
  fetchTable("security_audit_log"),
]);

writeJson(join(backupRoot, "db"), "cooperativas.json", cooperativas);
writeJson(join(backupRoot, "db"), "notas_pedido.json", notasPedido);
writeJson(join(backupRoot, "db"), "app_users.json", {
  ...appUsers,
  rows: (appUsers.rows ?? []).map((u) => ({ ...u, password_hash: "[REDACTED]" })),
});
writeJson(join(backupRoot, "db"), "security_audit_log.json", auditLog);

const cnpjSet = new Set();
for (const row of cooperativas.rows ?? []) {
  const c = normalizeCnpj(row.cnpj);
  if (c.length === 14) cnpjSet.add(c);
}

for (const bucket of BUCKETS) {
  for (const cnpj of await listStoragePrefixes(bucket)) cnpjSet.add(cnpj);
}

const storageStats = {};
for (const bucket of BUCKETS) {
  let count = 0;
  for (const cnpj of cnpjSet) {
    const outDir = join(backupRoot, "storage", bucket, cnpj);
    count += await downloadStorageFolder(bucket, cnpj, outDir);
  }
  storageStats[bucket] = count;
}

const manifest = {
  createdAt: new Date().toISOString(),
  supabaseUrl: url,
  cnpjs: [...cnpjSet].sort(),
  tables: {
    cooperativas: cooperativas.rows?.length ?? 0,
    notas_pedido: notasPedido.rows?.length ?? 0,
    app_users: appUsers.rows?.length ?? 0,
    security_audit_log: auditLog.rows?.length ?? 0,
  },
  storageFiles: storageStats,
};

writeJson(backupRoot, "manifest.json", manifest);

console.log("Backup concluído:");
console.log(JSON.stringify(manifest, null, 2));
