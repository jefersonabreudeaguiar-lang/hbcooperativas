/**
 * Ajusta operacional.json atual na nuvem sem rollback financeiro:
 * - remove tombstones que escondem notas ainda na fila ou enviadas após o cutoff
 * - remove fichas retro encostadas nessas notas
 * - replica notas órfãs do storage para a tabela SQL
 *
 * npx tsx scripts/sanitize-operacional-preservar-notas.mjs [--apply] [--cutoff=2026-09-19T18:00:00.000Z]
 */
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

const APPLY = process.argv.includes("--apply");
const cutoffArg = process.argv.find((a) => a.startsWith("--cutoff="));
const CUTOFF_ISO = cutoffArg?.split("=")[1] ?? "2026-09-19T18:00:00.000Z";
const CUTOFF_MS = new Date(CUTOFF_ISO).getTime();

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

const CNPJ = "62351750000165";
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { data: curBlob } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
const op = JSON.parse(await curBlob.text());

let { notas: tableNotas } = await fetchNotasFromTable(sb, CNPJ);
tableNotas = await mergeStorageFilaOrphansIntoTableNotas(sb, CNPJ, tableNotas);
const allNotas = tableNotas;
const notaById = new Map(allNotas.map((n) => [n.id, n]));
const filaIds = new Set(
  allNotas.filter((n) => isNotaNaFilaConferenciaResponsavel(n.status)).map((n) => n.id)
);

/** Notas que ainda não foram conferidas — não podem ser apagadas da fila por operacional retro. */
function notaProtegida(notaId) {
  const n = notaById.get(notaId);
  if (!n) return false;
  return isNotaNaFilaConferenciaResponsavel(n.status) || n.status === "rascunho";
}

const excl = op.notasPedidoExcluidas ?? [];
const newExcl = excl.filter((e) => !notaProtegida(e.id));
const fichas = op.fichaCorrida ?? [];
const newFichas = fichas.filter((f) => !notaProtegida(f.notaPedidoId));

console.log(`Modo ${APPLY ? "APPLY" : "dry-run"} | cutoff ${CUTOFF_ISO}`);
console.log(`Notas ${allNotas.length} | fila ${filaIds.size}`);
console.log(`Tombstones ${excl.length} → ${newExcl.length}`);
console.log(`Fichas ${fichas.length} → ${newFichas.length}`);

if (!APPLY) process.exit(0);

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const prePath = resolve(backupDir, `pre-sanitize-preservar-notas-${Date.now()}.json`);
writeFileSync(prePath, JSON.stringify(op, null, 2), "utf8");

const orphansUpsert = [];
if (APPLY) {
  const storageNotas = await fetchNotasFromStorage(sb, CNPJ);
  orphansUpsert.push(
    ...storageNotas.filter((n) => !tableNotas.some((t) => t.id === n.id) && n.status !== "rascunho")
  );
}
if (orphansUpsert.length) {
  await upsertNotasInTable(sb, CNPJ, orphansUpsert);
  console.log(`Upsert ${orphansUpsert.length} notas storage → SQL`);
}

const payload = {
  ...op,
  fichaCorrida: newFichas,
  notasPedidoExcluidas: newExcl,
  updatedAt: new Date().toISOString(),
};
delete payload.notasPedido;

const { error } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, JSON.stringify(payload), {
  contentType: "application/json",
  upsert: true,
});
if (error) {
  console.error(error.message);
  process.exit(1);
}
console.log("✓ Operacional sanitizado. Backup:", prePath);
