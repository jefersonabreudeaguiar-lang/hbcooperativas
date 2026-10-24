/**
 * Backup exclusivo (slice) dos dados de um cooperado na nuvem — read-only.
 * Grava em backups/cooperado-slice-<cooperadoId>-<timestamp>/ (gitignored).
 *
 *   node scripts/backup-cooperado-dados-slice.mjs
 *   node scripts/backup-cooperado-dados-slice.mjs --cooperado-id=c_xxx --cnpj=62351750000165
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const DEFAULT_COOP = "c_1781981564381_w67gg";
const DEFAULT_CNPJ = "62351750000165";
const REF_LABEL = "cooperado-mobile-fase3-v644";

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

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function normalizeCnpj(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function sha256Json(value) {
  const body = JSON.stringify(value);
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function writeJson(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(data, null, 2), "utf8");
}

function filterByCooperadoId(rows, cooperadoId) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && r.cooperadoId === cooperadoId);
}

function operacionalSlice(operacional, cooperadoId, coopId) {
  if (!operacional || typeof operacional !== "object") return null;
  const pick = (key) => filterByCooperadoId(operacional[key], cooperadoId);
  const slice = {
    meta: {
      cooperadoId,
      cooperativaId: coopId,
      extractedAt: new Date().toISOString(),
      source: "hb-cooperativa-sync/operacional.json",
    },
    fichaCorrida: pick("fichaCorrida"),
    pagamentosCooperado: pick("pagamentosCooperado"),
    descontos: pick("descontos"),
    arquivosMensais: (operacional.arquivosMensais ?? []).filter(
      (a) => a?.cooperadoId === cooperadoId || a?.cooperadoIds?.includes?.(cooperadoId)
    ),
    livroCaixa: (operacional.livroCaixa ?? []).filter(
      (e) => e?.cooperadoId === cooperadoId || e?.pagamentoCooperadoId
    ),
    syncMeta: operacional.syncMeta ?? null,
    fullReset: operacional.fullReset ?? null,
  };
  return slice;
}

async function downloadJson(sb, bucket, path) {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function listAndDownloadEntregas(sb, cnpj, notaIds) {
  const prefix = normalizeCnpj(cnpj);
  const { data: files, error } = await sb.storage.from("hb-entregas").list(prefix, { limit: 1000 });
  if (error || !files?.length) return { files: [], saved: 0 };
  const idSet = new Set(notaIds);
  const matched = [];
  for (const file of files) {
    if (!file?.name) continue;
    const base = file.name.replace(/\.json$/i, "");
    if (idSet.has(base) || file.name.includes("c_")) {
      const full = await downloadJson(sb, "hb-entregas", `${prefix}/${file.name}`);
      if (full) matched.push({ path: `${prefix}/${file.name}`, payload: full });
    }
  }
  return { files: matched, saved: matched.length };
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const cooperadoId = arg("cooperado-id", DEFAULT_COOP);
const cnpj = normalizeCnpj(arg("cnpj", DEFAULT_CNPJ));
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

const outRoot = resolve(process.cwd(), "backups", `${REF_LABEL}-${cooperadoId}-${timestamp()}`);
mkdirSync(outRoot, { recursive: true });

console.log(`Backup cooperado slice → ${outRoot}`);

const { data: coopRows, error: coopErr } = await supabase.from("cooperativas").select("*").eq("cnpj", cnpj);
if (coopErr || !coopRows?.length) {
  console.error("Cooperativa não encontrada:", cnpj, coopErr?.message);
  process.exit(1);
}
const coopRow = coopRows[0];
const coopId = coopRow.id;

writeJson(outRoot, "cooperativa.json", { id: coopId, cnpj, nome: coopRow.nome ?? null });

const operacional = await downloadJson(supabase, "hb-cooperativa-sync", `${cnpj}/operacional.json`);
const slice = operacionalSlice(operacional, cooperadoId, coopId);
writeJson(outRoot, "operacional-slice.json", slice);

const cooperadoBlob = await downloadJson(supabase, "hb-cooperados", `${cnpj}/${cooperadoId}.json`);
writeJson(outRoot, "cooperado-record.json", cooperadoBlob ?? { missing: true, cooperadoId });

const { data: notasTable, error: notasErr } = await supabase
  .from("notas_pedido")
  .select("*")
  .eq("cooperativa_cnpj", cnpj);
const notasFromTable = (notasTable ?? []).filter((row) => {
  const payload = row?.payload;
  const coop = payload?.cooperadoId ?? row?.cooperado_id;
  return coop === cooperadoId;
});

const { data: storageFiles } = await supabase.storage.from("hb-entregas").list(cnpj, { limit: 1000 });
const notasFromStorage = [];
for (const file of storageFiles ?? []) {
  if (!file?.name?.endsWith(".json")) continue;
  const full = await downloadJson(supabase, "hb-entregas", `${cnpj}/${file.name}`);
  if (full?.cooperadoId === cooperadoId) notasFromStorage.push(full);
}

writeJson(outRoot, "notas_pedido-table.json", notasErr ? { error: notasErr.message } : notasFromTable);
writeJson(outRoot, "notas_pedido-storage.json", notasFromStorage);

const notaIds = [
  ...new Set([
    ...notasFromTable.map((n) => n.id ?? n.payload?.id).filter(Boolean),
    ...notasFromStorage.map((n) => n.id).filter(Boolean),
  ]),
];
const entregas = await listAndDownloadEntregas(supabase, cnpj, notaIds);
writeJson(outRoot, "entregas-slice.json", entregas);

const manifest = {
  label: REF_LABEL,
  createdAt: new Date().toISOString(),
  cooperadoId,
  cnpj,
  cooperativaId: coopId,
  counts: {
    fichas: slice?.fichaCorrida?.length ?? 0,
    pagamentos: slice?.pagamentosCooperado?.length ?? 0,
    notasTable: notasFromTable.length,
    notasStorage: notasFromStorage.length,
    entregas: entregas.saved,
  },
  sha256: {
    operacionalSlice: slice ? sha256Json(slice) : null,
    cooperadoRecord: cooperadoBlob ? sha256Json(cooperadoBlob) : null,
    notasStorage: notasFromStorage.length ? sha256Json(notasFromStorage) : null,
  },
  gitTag: "cooperado-mobile-fase3-v644",
  productionBuild: 644,
};

writeJson(outRoot, "manifest.json", manifest);

console.log("Concluído:");
console.log(JSON.stringify(manifest, null, 2));
