import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REFS } from "./lib/assertNotProductionTarget.mjs";
import {
  fetchNotasFromTable,
  fetchNotasFromStorage,
  mergeStorageFilaOrphansIntoTableNotas,
  upsertNotasInTable,
} from "../src/lib/supabase/notasStorage.ts";
import { isNotaNaFilaConferenciaResponsavel } from "../src/utils/notaStatus.ts";

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
const cutoffArg = args.find((a) => a.startsWith("--cutoff="));
/** Notas enviadas a partir deste instante nunca são tombstonadas pelo operacional retro. */
const CUTOFF_ISO = cutoffArg?.split("=")[1] ?? "2026-09-19T18:00:00.000Z";
const CUTOFF_MS = new Date(CUTOFF_ISO).getTime();

const retroPathArg = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
if (!retroPathArg) {
  console.error(
    "Uso: npx tsx scripts/merge-operacional-retro-keep-notas.mjs [--apply] [--cutoff=ISO] <operacional-retro.json>"
  );
  process.exit(1);
}

const retroPath = resolve(process.cwd(), retroPathArg);
const retro = JSON.parse(readFileSync(retroPath, "utf8"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const projectRef = extractSupabaseProjectRef(url);
const isProduction = projectRef && PRODUCTION_SUPABASE_PROJECT_REFS.includes(projectRef);
if (APPLY && isProduction && process.env.I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE !== "1") {
  console.error("Produção: defina I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1 com --apply");
  process.exit(1);
}

const CNPJ = "62351750000165";
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { data: curBlob } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
const current = JSON.parse(await curBlob.text());

let { notas: tableNotas } = await fetchNotasFromTable(sb, CNPJ);
if (APPLY) {
  tableNotas = await mergeStorageFilaOrphansIntoTableNotas(sb, CNPJ, tableNotas);
}
const allNotas = tableNotas;

const notaById = new Map(allNotas.map((n) => [n.id, n]));
const filaIds = new Set(
  allNotas.filter((n) => isNotaNaFilaConferenciaResponsavel(n.status)).map((n) => n.id)
);

function notaProtegida(notaId) {
  const n = notaById.get(notaId);
  if (!n) return false;
  return isNotaNaFilaConferenciaResponsavel(n.status) || n.status === "rascunho";
}

const retroExcl = retro.notasPedidoExcluidas ?? [];
const curExcl = current.notasPedidoExcluidas ?? [];
const exclById = new Map();
for (const e of retroExcl) exclById.set(e.id, e);
for (const e of curExcl) exclById.set(e.id, e);

let droppedTombstones = 0;
const mergedExcl = [];
for (const e of exclById.values()) {
  if (notaProtegida(e.id)) {
    droppedTombstones++;
    continue;
  }
  mergedExcl.push(e);
}

const retroFichas = retro.fichaCorrida ?? [];
const trimmedFichas = retroFichas.filter((f) => !notaProtegida(f.notaPedidoId));
const trimmedFichaCount = retroFichas.length - trimmedFichas.length;

const payload = {
  ...retro,
  notasPedido: undefined,
  fichaCorrida: trimmedFichas,
  notasPedidoExcluidas: mergedExcl,
  updatedAt: new Date().toISOString(),
};
delete payload.notasPedido;

console.log(`Modo: ${APPLY ? "APPLY" : "dry-run"} | retro: ${retroPathArg}`);
console.log(`Cutoff proteção notas: ${CUTOFF_ISO}`);
console.log(`Notas na nuvem: ${allNotas.length} | fila conferência: ${filaIds.size}`);
console.log(
  `Tombstones: retro ${retroExcl.length} + cur ${curExcl.length} → merged ${mergedExcl.length} (removidos ${droppedTombstones})`
);
console.log(`Fichas retro: ${retroFichas.length} → ${trimmedFichas.length} (-${trimmedFichaCount} ligadas a notas protegidas)`);
console.log(
  `Pagamentos retro: ${(retro.pagamentosCooperado ?? []).length} | nuvem atual: ${(current.pagamentosCooperado ?? []).length}`
);

if (!APPLY) {
  console.log("\n[dry-run] Use --apply para publicar operacional mesclado.");
  process.exit(0);
}

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const prePath = resolve(backupDir, `pre-merge-retro-keep-notas-${Date.now()}.json`);
writeFileSync(prePath, JSON.stringify(current, null, 2), "utf8");
console.log("\nBackup operacional atual:", prePath);

const orphansUpsert = [];
if (APPLY) {
  const storageNotas = await fetchNotasFromStorage(sb, CNPJ);
  orphansUpsert.push(
    ...storageNotas.filter((n) => !tableNotas.some((t) => t.id === n.id) && n.status !== "rascunho")
  );
}
if (orphansUpsert.length) {
  const up = await upsertNotasInTable(sb, CNPJ, orphansUpsert);
  console.log(`Replicadas ${orphansUpsert.length} notas do storage → tabela SQL (${up.ok ? "ok" : up.error})`);
}

const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, JSON.stringify(payload), {
  contentType: "application/json",
  upsert: true,
});
if (upErr) {
  console.error("Upload operacional falhou:", upErr.message);
  process.exit(1);
}

console.log("\n✓ Operacional retro aplicado preservando notas novas (tabela/storage intactos).");
