/**
 * Compara crédito base HB × valor a receber (app cooperado) por cooperado.
 * npx tsx scripts/audit-hb-base-vs-valor-receber.ts [cnpj]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import {
  getConsolidadoFinanceiroCooperado,
  listarMesesPendentesQuantoVouReceber,
} from "../src/services/cooperadoEntregasService";
import {
  getCreditoBaseContaCoopReais,
  getCreditoBaseCooperadoCents,
  buildCreditosBaseMap,
} from "../src/modules/hb-credit/engine/creditBaseFromFicha";
import { getResumoPagamentoExibicao } from "../src/services/notaPedidoService";
import { reaisToCents } from "../src/modules/hb-credit/shared/money";
import type { AppData } from "../src/types";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Base antiga (só entregas brutas) — explica diferença histórica vs valor a receber. */
function getCreditoBaseEntregasBrutasReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): number {
  const meses = listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  let total = 0;
  for (const mes of meses) {
    total += getResumoPagamentoExibicao(data, cooperadoId, mes, cooperativaId).valorEntregas;
  }
  return round2(total);
}

/** Base alinhada ao "quanto vou receber" (mesmos meses + valorLiquido do resumo). */
function getCreditoBaseAlinhadoReceberReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): { total: number; meses: string[]; porMes: Record<string, { entregas: number; liquido: number }> } {
  const meses = listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
  let total = 0;
  const porMes: Record<string, { entregas: number; liquido: number }> = {};
  for (const mes of meses) {
    const r = getResumoPagamentoExibicao(data, cooperadoId, mes, cooperativaId);
    porMes[mes] = { entregas: r.valorEntregas, liquido: r.valorLiquido };
    total += r.valorLiquido;
  }
  return { total: round2(total), meses, porMes };
}

loadEnv();

async function main() {
const CNPJ = process.argv[2]?.replace(/\D/g, "") || "62351750000165";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  realtime: { transport: ws },
});

const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

const [operacional, cloudCooperados, storageNotas, tableResult, contratos] = await Promise.all([
  fetchOperacionalSync(sb, CNPJ),
  fetchCooperadosFromStorage(sb, CNPJ),
  fetchNotasFromStorage(sb, CNPJ),
  fetchNotasFromTable(sb, CNPJ),
  fetchContratosSync(sb, CNPJ),
]);
if (!operacional) throw new Error("operacional.json ausente");

const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
  ...n,
  cooperativaId: n.cooperativaId ?? coop.id,
}));

let data: AppData = {
  cooperativas: [coop],
  users: [],
  cooperados: [],
  mensalidades: [],
  cotas: [],
  instituicoes: [],
  produtosInstituicao: [],
  notasPedido: notas,
  fichaCorrida: [],
  pagamentosCooperado: [],
  arquivosMensais: [],
  ajustesFichaMes: [],
  entregas: [],
  descontos: [],
  valoresAvulsosReceber: [],
  pagamentos: [],
  financeiro: [],
  comunicados: [],
  reclamacoes: [],
  votacaoPautas: [],
  votacaoVotos: [],
  propriedades: [],
  veiculos: [],
  fechamentos: [],
  livroCaixa: [],
  prestacoesContas: [],
  auditLog: [],
  config: { descontoPadraoCooperativa: 5 },
};
data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
data = reconciliarFichaFromNotasConferidas(data);

const { data: cfg } = await sb
  .from("hb_credit_cooperative_settings")
  .select("global_credit_cap_percent")
  .eq("cooperative_cnpj", CNPJ)
  .maybeSingle();
const pct = Number(cfg?.global_credit_cap_percent ?? 0);

const { data: accounts } = await sb
  .from("hb_credit_accounts")
  .select("cooperado_id, limit_released_cents, amount_used_cents")
  .eq("cooperative_cnpj", CNPJ);

const accByCoop = new Map((accounts ?? []).map((a) => [String(a.cooperado_id), a]));

const ids = [...new Set(data.cooperados.map((c) => c.id))].sort();
const basesOld = buildCreditosBaseMap(data, ids, coop.id);

console.log(`=== HB base × valor a receber — CNPJ ${CNPJ} — teto ${pct}% ===\n`);
console.log(
  "Cooperado".padEnd(28),
  "| baseHB(a receber)".padStart(16),
  "| aReceber(app)".padStart(14),
  "| ent−rec R$".padStart(10),
  "| limiteHB".padStart(12),
  "| limite50%rec".padStart(14)
);

let sumBaseOld = 0;
let sumReceber = 0;
let sumEntregas = 0;
let sumLimite = 0;

for (const c of data.cooperados.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto))) {
  const fin = getConsolidadoFinanceiroCooperado(data, c.id, coop.id);
  const alinh = getCreditoBaseAlinhadoReceberReais(data, c.id, coop.id);
  const baseHb = getCreditoBaseContaCoopReais(data, c.id, coop.id);
  const baseEntregas = getCreditoBaseEntregasBrutasReais(data, c.id, coop.id);
  const diffBaseReceber = round2(baseHb - fin.valorLiquido);
  const diffEntregasReceber = round2(baseEntregas - fin.valorLiquido);
  if (baseHb <= 0 && fin.valorLiquido <= 0 && baseEntregas <= 0) continue;

  const acc = accByCoop.get(c.id);
  const limite = acc ? Number(acc.limit_released_cents) / 100 : 0;
  const limiteEsperadoReceber = round2((fin.valorLiquido * pct) / 100);

  sumBaseOld += baseHb;
  sumReceber += fin.valorLiquido;
  sumEntregas += baseEntregas;
  sumLimite += limite;

  const flag =
    Math.abs(diffEntregasReceber - 60) < 0.02
      ? " ← R$60 entregas?"
      : diffBaseReceber !== 0
        ? " * base≠receber"
        : "";

  console.log(
    c.nomeCompleto.slice(0, 27).padEnd(28),
    "|",
    baseHb.toFixed(2).padStart(14),
    "|",
    fin.valorLiquido.toFixed(2).padStart(12),
    "|",
    diffEntregasReceber.toFixed(2).padStart(8) + flag,
    "|",
    limite.toFixed(2).padStart(10),
    "|",
    limiteEsperadoReceber.toFixed(2).padStart(12)
  );

  if (Math.abs(diffEntregasReceber) >= 0.01 && Math.abs(diffEntregasReceber) <= 120) {
    console.log("  meses:", alinh.meses.join(", "));
    for (const [mes, v] of Object.entries(alinh.porMes)) {
      console.log(`    ${mes}: entregas ${v.entregas.toFixed(2)} → líquido ${v.liquido.toFixed(2)} (Δ ${round2(v.entregas - v.liquido).toFixed(2)})`);
    }
    const cons = getConsolidadoFinanceiroCooperado(data, c.id, coop.id);
    if (cons.resumo.descontosExtras?.length) {
      for (const d of cons.resumo.descontosExtras) {
        console.log(`    extra ficha: ${d.motivo?.slice(0, 40)} — ${d.valor}`);
      }
    }
  }
}

console.log("\n--- Totais cooperativa ---");
console.log("Σ base HB (a receber):", round2(sumBaseOld).toFixed(2));
console.log("Σ valor a receber app:", round2(sumReceber).toFixed(2));
console.log("Σ diferença (base HB − receber):", round2(sumBaseOld - sumReceber).toFixed(2));
console.log("Σ entregas brutas:", round2(sumEntregas).toFixed(2));
console.log("Σ diferença (entregas − receber):", round2(sumEntregas - sumReceber).toFixed(2), "← origem típica do Δ R$60");
console.log("Σ limite liberado nuvem:", round2(sumLimite).toFixed(2));
console.log("Σ teto% × receber (esperado se alinhado):", round2((sumReceber * pct) / 100).toFixed(2));
console.log("Σ base map cents (dashboard):", Object.values(basesOld).reduce((s, v) => s + v, 0) / 100);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
