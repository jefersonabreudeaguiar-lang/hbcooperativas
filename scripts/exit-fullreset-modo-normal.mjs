/**
 * Encerra modo restore (fullReset) na nuvem mantendo o operacional intacto — fluxo normal de sync/fotos.
 *
 * Dry-run: node scripts/exit-fullreset-modo-normal.mjs
 * Aplicar:  node scripts/exit-fullreset-modo-normal.mjs --apply --confirm-cnpj=62351750000165
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const key = t.slice(0, eq).trim();
  const value = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

const APPLY = process.argv.includes("--apply");
const confirmArg = process.argv.find((a) => a.startsWith("--confirm-cnpj="));
const CNPJ = (confirmArg?.split("=")[1] ?? "62351750000165").replace(/\D/g, "");

if (APPLY && !confirmArg) {
  console.error("Use --apply --confirm-cnpj=XXXXXXXXXXXXXX");
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const path = `${CNPJ}/operacional.json`;
const { data: blob, error: dlErr } = await sb.storage.from("hb-cooperativa-sync").download(path);
if (dlErr || !blob) {
  console.error("Download failed", dlErr?.message);
  process.exit(1);
}

const before = JSON.parse(await blob.text());
console.log("Antes:", {
  fullReset: before.fullReset,
  operationalResetVersion: before.operationalResetVersion,
  pagamentos: (before.pagamentosCooperado ?? []).length,
  fichas: (before.fichaCorrida ?? []).length,
  updatedAt: before.updatedAt,
});

if (!before.fullReset) {
  console.log("Nuvem já está em modo normal (fullReset ausente/false). Nada a fazer.");
  process.exit(0);
}

const next = { ...before };
delete next.fullReset;
delete next.wipeNotas;
next.updatedAt = new Date().toISOString();

console.log("Depois (proposto):", {
  fullReset: next.fullReset,
  operationalResetVersion: next.operationalResetVersion,
  pagamentos: (next.pagamentosCooperado ?? []).length,
  fichas: (next.fichaCorrida ?? []).length,
});

if (!APPLY) {
  console.log("\nDry-run. Para aplicar: node scripts/exit-fullreset-modo-normal.mjs --apply --confirm-cnpj=" + CNPJ);
  process.exit(0);
}

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const backupPath = resolve(backupDir, `pre-exit-fullreset-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify(before, null, 0), "utf8");
console.log("Backup:", backupPath);

const body = JSON.stringify(next);
const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(path, body, {
  contentType: "application/json",
  upsert: true,
});
if (upErr) {
  console.error("Upload failed", upErr.message);
  process.exit(1);
}

console.log("OK — fullReset removido. Cooperados voltam ao sync normal; pagamentos/fichas preservados.");
