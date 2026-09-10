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

/** Tabelas Supabase — snapshot completo HB Cooperativas */
const DB_TABLES = [
  "cooperativas",
  "notas_pedido",
  "app_users",
  "security_audit_log",
  "password_reset_tokens",
  "cooperative_audit_log",
  "hb_platform_settings",
  "hb_asaas_customers",
  "hb_asaas_charges",
  "hb_asaas_webhook_events",
  "hb_credit_cooperative_caps",
  "hb_credit_accounts",
  "hb_credit_partners",
  "hb_credit_payment_intents",
  "hb_credit_transactions",
  "hb_credit_ledger_entries",
  "hb_credit_receivables",
  "hb_credit_refunds",
  "hb_credit_audit_log",
  "hb_credit_idempotency_records",
  "hb_credit_settlements",
  "hb_credit_refund_requests",
  "hb_credit_fiscal_notes",
  "hb_credit_cashback_balances",
  "hb_credit_discount_allocations",
  "hb_credit_app_repasse",
  "hb_credit_partner_pix_change_requests",
];

const REDACT_FIELDS = {
  app_users: ["password_hash"],
  password_reset_tokens: ["token_hash", "token"],
  hb_credit_partners: ["pin_hash", "pin"],
};

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
  let rows = data ?? [];
  const redact = REDACT_FIELDS[name];
  if (redact?.length) {
    rows = rows.map((row) => {
      const copy = { ...row };
      for (const field of redact) {
        if (copy[field] != null) copy[field] = "[REDACTED]";
      }
      return copy;
    });
  }
  return { ok: true, rows };
}

const backupRoot = resolve(process.cwd(), "backups", timestamp());
mkdirSync(backupRoot, { recursive: true });

console.log(`Gerando backup em ${backupRoot}...`);

const tableResults = {};
let cooperativasRows = [];
for (const table of DB_TABLES) {
  process.stdout.write(`  db/${table}... `);
  const result = await fetchTable(table);
  writeJson(join(backupRoot, "db"), `${table}.json`, result);
  tableResults[table] = {
    ok: result.ok,
    rows: result.rows?.length ?? 0,
    error: result.error ?? null,
  };
  if (table === "cooperativas") cooperativasRows = result.rows ?? [];
  console.log(result.ok ? `${result.rows?.length ?? 0} linhas` : result.error);
}

const cnpjSet = new Set();
for (const row of cooperativasRows) {
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
  purpose: "backup-completo-hb-cooperativas",
  cnpjs: [...cnpjSet].sort(),
  tables: tableResults,
  storageFiles: storageStats,
};

writeJson(backupRoot, "manifest.json", manifest);

console.log("Backup concluído:");
console.log(JSON.stringify(manifest, null, 2));
