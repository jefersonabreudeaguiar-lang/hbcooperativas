/**
 * Restaura operacional.json exatamente do backup (sem preservar notas novas),
 * exporta notas posteriores ao instante do backup para pasta fora do app e remove da nuvem.
 *
 * Dry-run:
 *   npx tsx scripts/restore-exact-backup-archive-notas-posteriores.mjs
 *
 * Aplicar produção:
 *   set I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1
 *   npx tsx scripts/restore-exact-backup-archive-notas-posteriores.mjs --apply
 *
 * Opções:
 *   --backup=path   (default: pre-repair-pagamentos-integridade-1790029768549.json)
 *   --archive-dir=  (default: %USERPROFILE%/Downloads/hb-notas-arquivadas-pos-backup-2026-09-21)
 *   --no-broadcast  (não publica fullReset após restore)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REFS } from "./lib/assertNotProductionTarget.mjs";
import {
  fetchNotasFromTable,
  fetchNotasFromStorage,
  deleteNotaFromStorage,
  deleteNotaFromTable,
} from "../src/lib/supabase/notasStorage.ts";

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
const NO_BROADCAST = args.includes("--no-broadcast");
const backupArg =
  args.find((a) => a.startsWith("--backup="))?.split("=")[1] ??
  "scripts/backups/pre-repair-pagamentos-integridade-1790029768549.json";
const defaultArchive = join(
  process.env.USERPROFILE ?? process.env.HOME ?? process.cwd(),
  "Downloads",
  "hb-notas-arquivadas-pos-backup-2026-09-21"
);
const archiveDirArg = args.find((a) => a.startsWith("--archive-dir="))?.split("=")[1];
const ARCHIVE_DIR = resolve(archiveDirArg ?? defaultArchive);

const backupPath = resolve(process.cwd(), backupArg);
if (!existsSync(backupPath)) {
  console.error("Backup não encontrado:", backupPath);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const projectRef = extractSupabaseProjectRef(url);
const isProduction = projectRef && PRODUCTION_SUPABASE_PROJECT_REFS.includes(projectRef);
if (APPLY && isProduction && process.env.I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE !== "1") {
  console.error("Produção: defina I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1");
  process.exit(1);
}

const CNPJ = "62351750000165";
const target = JSON.parse(readFileSync(backupPath, "utf8"));
const BACKUP_MS = new Date(String(target.updatedAt ?? "")).getTime();
if (!Number.isFinite(BACKUP_MS)) {
  console.error("Backup sem updatedAt válido");
  process.exit(1);
}

function notaCreatedMs(nota) {
  if (nota.createdAt) {
    const t = new Date(String(nota.createdAt)).getTime();
    if (Number.isFinite(t)) return t;
  }
  const m = /^np_(\d+)_/.exec(String(nota.id ?? ""));
  if (m) {
    const t = Number(m[1]);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function collectNotaIdsFromOperacional(op) {
  const ids = new Set();
  for (const f of op.fichaCorrida ?? []) {
    if (f.notaPedidoId) ids.add(f.notaPedidoId);
  }
  for (const am of op.arquivosMensais ?? []) {
    for (const id of am.notaPedidoIds ?? []) ids.add(id);
  }
  for (const e of op.notasPedidoExcluidas ?? []) {
    if (e.id) ids.add(e.id);
  }
  return ids;
}

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
  console.log(
    `${label}: pag ${pag.length}`,
    pst,
    "| ficha",
    fich.length,
    fst,
    "| reset",
    op.operationalResetVersion,
    "| updatedAt",
    op.updatedAt
  );
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { data: curBlob, error: dlErr } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
if (dlErr || !curBlob) {
  console.error("Falha operacional atual:", dlErr?.message);
  process.exit(1);
}
const current = JSON.parse(await curBlob.text());

let { notas: tableNotas } = await fetchNotasFromTable(sb, CNPJ);
const storageNotas = await fetchNotasFromStorage(sb, CNPJ);
const byId = new Map();
for (const n of [...tableNotas, ...storageNotas]) {
  if (!byId.has(n.id)) byId.set(n.id, n);
}
const allNotas = [...byId.values()];

const backupNotaIds = collectNotaIdsFromOperacional(target);
const posteriores = allNotas.filter((n) => notaCreatedMs(n) > BACKUP_MS + 1000);

console.log(`Modo ${APPLY ? "APPLY" : "dry-run"} | ref ${projectRef}`);
console.log("Backup:", basename(backupPath), "| instante", target.updatedAt);
console.log(`Notas na nuvem (únicas): ${allNotas.length} | referenciadas no backup operacional: ${backupNotaIds.size}`);
console.log(`Notas posteriores ao backup (serão arquivadas): ${posteriores.length}`);
if (posteriores.length) {
  console.log(
    "Amostra:",
    posteriores.slice(0, 8).map((n) => `${n.id} ${n.status} ${n.createdAt ?? n.updatedAt}`)
  );
}

summarize(current, "NUVEM (antes)");
summarize(target, "BACKUP (alvo)");

if (!APPLY) {
  console.log("\n[dry-run] Pasta de arquivo prevista:", ARCHIVE_DIR);
  console.log("[dry-run] Use --apply para restaurar operacional exato, arquivar e remover notas posteriores.");
  process.exit(0);
}

mkdirSync(ARCHIVE_DIR, { recursive: true });
const manifest = {
  archivedAt: new Date().toISOString(),
  backupFile: basename(backupPath),
  backupUpdatedAt: target.updatedAt,
  cnpj: CNPJ,
  notas: posteriores.map((n) => ({
    id: n.id,
    status: n.status,
    cooperadoId: n.cooperadoId,
    instituicaoId: n.instituicaoId,
    mesReferencia: n.mesReferencia,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  })),
};
writeFileSync(join(ARCHIVE_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
writeFileSync(join(ARCHIVE_DIR, "notas-completas.json"), JSON.stringify(posteriores, null, 2), "utf8");
console.log("Arquivo exportado em:", ARCHIVE_DIR);

for (const nota of posteriores) {
  await deleteNotaFromStorage(sb, CNPJ, nota.id);
  await deleteNotaFromTable(sb, CNPJ, nota.id);
}
console.log(`Removidas ${posteriores.length} nota(s) da nuvem (SQL + storage).`);

const backupDir = resolve(process.cwd(), "scripts/backups");
mkdirSync(backupDir, { recursive: true });
const preOpPath = resolve(backupDir, `pre-exact-restore-${Date.now()}.json`);
writeFileSync(preOpPath, JSON.stringify(current, null, 2), "utf8");
console.log("Backup operacional pré-restore:", preOpPath);

const restored = {
  ...target,
  updatedAt: target.updatedAt,
  fullReset: false,
  wipeNotas: false,
};
delete restored.notasPedido;

const { error: upErr } = await sb.storage.from("hb-cooperativa-sync").upload(`${CNPJ}/operacional.json`, JSON.stringify(restored), {
  contentType: "application/json",
  upsert: true,
});
if (upErr) {
  console.error("Upload operacional falhou:", upErr.message);
  process.exit(1);
}

if (!NO_BROADCAST) {
  const prevVer = restored.operationalResetVersion ?? 0;
  const nextVer = prevVer + 1;
  const alignPayload = {
    ...restored,
    operationalResetVersion: nextVer,
    fullReset: true,
    wipeNotas: false,
    updatedAt: new Date().toISOString(),
  };
  const { error: alignErr } = await sb.storage
    .from("hb-cooperativa-sync")
    .upload(`${CNPJ}/operacional.json`, JSON.stringify(alignPayload), { contentType: "application/json", upsert: true });
  if (alignErr) {
    console.error("Broadcast align falhou:", alignErr.message);
    process.exit(1);
  }
  console.log(`✓ fullReset publicado operationalResetVersion ${prevVer} → ${nextVer}`);
}

const { data: verifyBlob } = await sb.storage.from("hb-cooperativa-sync").download(`${CNPJ}/operacional.json`);
summarize(JSON.parse(await verifyBlob.text()), "NUVEM (depois)");
console.log("\n✓ Restauração exata concluída. Peça Ctrl+F5 / reabrir app em todos os aparelhos.");
