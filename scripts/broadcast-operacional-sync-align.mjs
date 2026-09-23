/**
 * Alinha aparelhos com operacional.json da nuvem após restore manual.
 * Publica fullReset + nova operationalResetVersion (wipeNotas: false).
 *
 * node scripts/broadcast-operacional-sync-align.mjs
 * node scripts/broadcast-operacional-sync-align.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const projectRef = extractSupabaseProjectRef(url);
if (APPLY && projectRef && PRODUCTION_SUPABASE_PROJECT_REFS.includes(projectRef)) {
  if (process.env.I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE !== "1") {
    console.error("Produção: defina I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1");
    process.exit(1);
  }
}

/** Deve bater com src/services/operationalReset.ts após deploy; nuvem pode ir 1 acima do app em produção. */
const TARGET_RESET_VERSION = 12;
const CNPJ = "62351750000165";

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { data: blob, error: dlErr } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
if (dlErr || !blob) {
  console.error("Download falhou:", dlErr?.message);
  process.exit(1);
}

const op = JSON.parse(await blob.text());
const prevVer = op.operationalResetVersion ?? 0;
const nextVer = Math.max(prevVer, TARGET_RESET_VERSION - 1) + 1;
if (nextVer <= prevVer && op.fullReset === true) {
  console.log(`Já publicado: operationalResetVersion=${prevVer}, fullReset=true`);
  if (!APPLY) process.exit(0);
}

console.log(`Modo ${APPLY ? "APPLY" : "dry-run"}`);
console.log(`operacional updatedAt: ${op.updatedAt}`);
console.log(`fichas ${(op.fichaCorrida ?? []).length} | pagamentos ${(op.pagamentosCooperado ?? []).length}`);
console.log(`reset ${prevVer} → ${nextVer} | fullReset=true | wipeNotas=false`);

if (!APPLY) {
  console.log("\n[dry-run] Use --apply para publicar.");
  process.exit(0);
}

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const prePath = resolve(backupDir, `pre-broadcast-sync-align-${Date.now()}.json`);
writeFileSync(prePath, JSON.stringify(op, null, 2), "utf8");

const payload = {
  ...op,
  operationalResetVersion: nextVer,
  fullReset: true,
  wipeNotas: false,
  updatedAt: new Date().toISOString(),
};

const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, JSON.stringify(payload), {
  contentType: "application/json",
  upsert: true,
});

if (upErr) {
  console.error("Upload falhou:", upErr.message);
  process.exit(1);
}

console.log("✓ Sinal de alinhamento publicado.");
console.log("Backup:", prePath);
console.log("\nEm cada celular/PC: abra o HB Cooperativas (ou puxe para atualizar).");
console.log("O app limpa lançamentos locais antigos e baixa o operacional da nuvem (notas/fotos mantidas).");
