/**
 * Restaura operacional.json na nuvem a partir de um backup local (scripts/backups/*.json).
 *
 * Uso (simulação):
 *   node scripts/restore-operacional-from-backup.mjs scripts/backups/pre-repair-pagamentos-integridade-1790029768549.json
 *
 * Aplicar em produção (exige confirmação explícita):
 *   set I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1
 *   node scripts/restore-operacional-from-backup.mjs --apply scripts/backups/pre-repair-pagamentos-integridade-1790029768549.json
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REFS } from "./lib/assertNotProductionTarget.mjs";

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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const backupArg = args.find((a) => !a.startsWith("--"));
if (!backupArg) {
  console.error("Informe o caminho do backup JSON.");
  process.exit(1);
}

const backupPath = resolve(process.cwd(), backupArg);
if (!existsSync(backupPath)) {
  console.error("Backup não encontrado:", backupPath);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const projectRef = extractSupabaseProjectRef(url);
const isProduction = projectRef && PRODUCTION_SUPABASE_PROJECT_REFS.includes(projectRef);

if (APPLY && isProduction && process.env.I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE !== "1") {
  console.error(
    "Produção detectada. Para aplicar, defina I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1 e use --apply."
  );
  process.exit(1);
}

function normalizeCnpj(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

const CNPJ = normalizeCnpj(process.argv.find((a) => /^\d{14}$/.test(a)) ?? "62351750000165");

function summarize(op, label) {
  const pag = op.pagamentosCooperado ?? [];
  const pst = {};
  pag.forEach((p) => {
    pst[p.status] = (pst[p.status] ?? 0) + 1;
  });
  const fich = op.fichaCorrida ?? [];
  const fst = {};
  fich.forEach((f) => {
    fst[f.status] = (fst[f.status] ?? 0) + 1;
  });
  console.log(`${label}: pag ${pag.length}`, pst, "| ficha", fich.length, fst, "| updatedAt", op.updatedAt);
}

const target = JSON.parse(readFileSync(backupPath, "utf8"));
if (!target || typeof target !== "object") {
  console.error("Backup inválido");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { data: blob, error: dlErr } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
if (dlErr || !blob) {
  console.error("Falha ao baixar operacional atual:", dlErr?.message ?? "sem blob");
  process.exit(1);
}

const current = JSON.parse(await blob.text());
console.log(`CNPJ ${CNPJ} | ref ${projectRef} | modo ${APPLY ? "APPLY" : "dry-run"}`);
console.log("Backup:", basename(backupPath));
summarize(current, "NUVEM (antes)");
summarize(target, "BACKUP (alvo)");

const payload = {
  ...target,
  updatedAt: new Date().toISOString(),
};

if (!APPLY) {
  console.log("\n[dry-run] Nenhuma alteração na nuvem. Use --apply para restaurar.");
  process.exit(0);
}

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const preRestorePath = resolve(backupDir, `pre-restore-operacional-${Date.now()}.json`);
writeFileSync(preRestorePath, JSON.stringify(current, null, 2), "utf8");
console.log("\nBackup da nuvem atual salvo em:", preRestorePath);

const body = JSON.stringify(payload);
const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, body, {
  contentType: "application/json",
  upsert: true,
});

if (upErr) {
  console.error("Falha no upload:", upErr.message);
  process.exit(1);
}

const { data: verifyBlob } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
const verify = JSON.parse(await verifyBlob.text());
summarize(verify, "NUVEM (depois)");
console.log("\n✓ operacional.json restaurado a partir do backup.");
