/**
 * Notas que inflam o badge Pagar (22) além do backup puro (18).
 * Dry-run: npx tsx scripts/archive-notas-badge-inflacao.mjs
 * Apply: I_CONFIRM_PRODUCTION_OPERACIONAL_RESTORE=1 npx tsx scripts/archive-notas-badge-inflacao.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseProjectRef, PRODUCTION_SUPABASE_PROJECT_REFS } from "./lib/assertNotProductionTarget.mjs";
import {
  fetchNotasFromTable,
  fetchNotasFromStorage,
  deleteNotaFromStorage,
  deleteNotaFromTable,
} from "../src/lib/supabase/notasStorage.ts";
import { fetchCooperadosFromCloud, listCooperadosDaCooperativa } from "../src/services/cooperadoCloudService.ts";
import { cooperadoPendentePagamentoResponsavel } from "../src/services/cooperadoEntregasService.ts";
import {
  listarPagamentosAguardandoAssinatura,
  listarPagamentosReciboAguardandoVerificacao,
} from "../src/services/filaDoDiaService.ts";

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
const BACKUP_PATH = resolve(
  process.cwd(),
  "scripts/backups/pre-repair-pagamentos-integridade-1790029768549.json"
);
const ARCHIVE_DIR = join(
  process.env.USERPROFILE ?? process.cwd(),
  "Downloads",
  "hb-notas-arquivadas-badge-inflacao-2026-09-21"
);
const CNPJ = "62351750000165";
const coopId = "06342dae-8191-4193-94b6-d0be3a82e10b";

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

function badge(data) {
  const aguardando = listarPagamentosAguardandoAssinatura(data, coopId);
  const verificacao = listarPagamentosReciboAguardandoVerificacao(data, coopId);
  const paraPagar = listCooperadosDaCooperativa(data, coopId).filter((c) =>
    cooperadoPendentePagamentoResponsavel(data, c.id, undefined, coopId)
  );
  return {
    aguardando: aguardando.length,
    paraPagar: paraPagar.length,
    verificacao: verificacao.length,
    total: aguardando.length + paraPagar.length + verificacao.length,
    paraPagarIds: paraPagar.map((c) => c.id),
  };
}

function buildBase(backup, cooperados, notas) {
  return {
    cooperativas: [{ id: coopId, cnpj: CNPJ, nome: "CoopeagriPla", createdAt: "", updatedAt: "" }],
    cooperados,
    notasPedido: notas.map((n) => ({ ...n, cooperativaId: coopId })),
    fichaCorrida: backup.fichaCorrida ?? [],
    pagamentosCooperado: backup.pagamentosCooperado ?? [],
    arquivosMensais: backup.arquivosMensais ?? [],
    mensalidades: backup.mensalidades ?? [],
    descontos: backup.descontos ?? [],
    instituicoes: [],
    produtosInstituicao: [],
    users: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

const backup = JSON.parse(readFileSync(BACKUP_PATH, "utf8"));
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const { cooperados } = await fetchCooperadosFromCloud(CNPJ);
let { notas: tableNotas } = await fetchNotasFromTable(sb, CNPJ);
const storageNotas = await fetchNotasFromStorage(sb, CNPJ);
const byId = new Map();
for (const n of [...tableNotas, ...storageNotas]) {
  if (!byId.has(n.id)) byId.set(n.id, n);
}
const allNotas = [...byId.values()];

const baseline = badge(buildBase(backup, cooperados, []));
const current = badge(buildBase(backup, cooperados, allNotas));

console.log("Baseline backup (sem notas):", baseline);
console.log("Com notas atuais na nuvem:", current);

if (baseline.total === current.total) {
  console.log("Nada a arquivar para badge.");
  process.exit(0);
}

const targetParaPagar = new Set(baseline.paraPagarIds);
const inflatedCoops = current.paraPagarIds.filter((id) => !targetParaPagar.has(id));
console.log("Cooperados extras por causa das notas:", inflatedCoops);

const fichaNotaIds = new Set(
  (backup.fichaCorrida ?? []).map((f) => f.notaPedidoId).filter(Boolean)
);

/** Notas dos cooperados inflados que não estão na ficha do backup — candidatas a arquivar. */
const toArchive = allNotas.filter((n) => {
  if (!inflatedCoops.includes(n.cooperadoId)) return false;
  if (n.status === "rascunho") return false;
  if (fichaNotaIds.has(n.id)) return false;
  return true;
});

console.log(`Notas a arquivar: ${toArchive.length}`);
console.log(
  toArchive.slice(0, 12).map((n) => `${n.id} ${n.status} coop=${n.cooperadoId} mes=${n.mesReferencia}`)
);

if (!APPLY) {
  console.log("\n[dry-run] Use --apply para mover para:", ARCHIVE_DIR);
  process.exit(0);
}

mkdirSync(ARCHIVE_DIR, { recursive: true });
writeFileSync(
  join(ARCHIVE_DIR, "manifest.json"),
  JSON.stringify(
    {
      archivedAt: new Date().toISOString(),
      reason: "badge_inflacao_22_vs_backup_18",
      inflatedCooperados: inflatedCoops,
      notas: toArchive.map((n) => ({
        id: n.id,
        status: n.status,
        cooperadoId: n.cooperadoId,
        mesReferencia: n.mesReferencia,
      })),
    },
    null,
    2
  ),
  "utf8"
);
writeFileSync(join(ARCHIVE_DIR, "notas-completas.json"), JSON.stringify(toArchive, null, 2), "utf8");

for (const nota of toArchive) {
  await deleteNotaFromStorage(sb, CNPJ, nota.id);
  await deleteNotaFromTable(sb, CNPJ, nota.id);
}

console.log(`✓ ${toArchive.length} nota(s) arquivadas e removidas da nuvem.`);
