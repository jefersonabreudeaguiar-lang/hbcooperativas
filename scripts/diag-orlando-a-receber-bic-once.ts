/**
 * Orlando — diagnóstico A receber × BIC × meses quitados (read-only).
 * npx tsx scripts/diag-orlando-a-receber-bic-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  getTotalAPagarCooperado,
  reconciliarFichaFromNotasConferidas,
  getResumoValorAPagarRelatorio,
  getResumoPagamentoCooperado,
  getPagamentoAguardandoCooperado,
  getPagamentoConfirmadoCooperadoMes,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import {
  bicCentralListarResumosMensaisEntregas,
  bicCentralValorAReceberAgregado,
} from "../src/services/bicLeituraCentralCooperado";
import {
  cooperadoMesQuitado,
  getResumoMesEntregasCooperado,
  getValorQuantoVouReceber,
  getValorQuantoVouReceberMotorLegado,
  listarMesesPagosCooperado,
} from "../src/services/cooperadoEntregasService";
import { valorPendenteRecebimentoFichaCooperado } from "../src/services/cooperadoFichaTimelineService";

function loadEnvFile(path: string) {
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

const CNPJ = normalizeCnpj("62351750000165");
const ORLANDO = "c_1782263929381_ncp55";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("coop not found");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const coopId = coop.id;

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  if (!operacional) throw new Error("sem operacional");

  let data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
      ...n,
      cooperativaId: n.cooperativaId ?? coopId,
    })),
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
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
    config: { descontoPadraoCooperativa: 5 },
  };
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coopId);
  if (contratos) data = mergeContratosIntoData(data, contratos, coopId);
  data = mergeOperacionalIntoData(data, operacional, coopId, cloudCooperados);
  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));

  const canon = resolverCooperadoIdCanonico(data, ORLANDO, coopId);
  const bic = bicCentralValorAReceberAgregado(data, ORLANDO, coopId);
  const motor = getValorQuantoVouReceber(data, ORLANDO, coopId);
  const motorLegado = getValorQuantoVouReceberMotorLegado(data, ORLANDO, coopId);
  const totalMotor = getTotalAPagarCooperado(data, ORLANDO, undefined, coopId);
  const fichaPend = valorPendenteRecebimentoFichaCooperado(data, ORLANDO, coopId);

  console.log("=== Orlando — nuvem", new Date().toISOString(), "===\n");
  console.log("Canonico:", canon);
  console.log("BIC agregado (card): valor=", bic.valor, "meses=", bic.meses, "mes=", bic.mes);
  console.log("QuantoVouReceber motor:", motor.valor, "meses=", motor.meses);
  console.log(
    "Motor legado (mesmo fn, incl. aguardandoAssinatura):",
    motorLegado.valor,
    "aguardandoAssinatura=",
    motorLegado.aguardandoAssinatura,
    "valorRecibo=",
    motorLegado.valorRecibo
  );
  console.log("getTotalAPagarCooperado:", totalMotor);
  console.log("valorPendenteRecebimentoFichaCooperado:", fichaPend);
  console.log("Meses pagos (PIX confirmado):", listarMesesPagosCooperado(data, ORLANDO, coopId));

  console.log("\nPagamentos cooperado:");
  for (const p of data.pagamentosCooperado.filter((p) => p.cooperadoId === ORLANDO || p.cooperadoId === canon)) {
    console.log(
      `  ${p.id.slice(0, 20)}… | ${p.status} | liq=${p.valorLiquido} | mesRef=${p.mesReferencia} | meses=${(p.mesesReferencia ?? []).join(",")}`
    );
  }

  console.log("\nFicha pendente com valor > 0:");
  for (const f of data.fichaCorrida.filter(
    (f) => (f.cooperadoId === ORLANDO || f.cooperadoId === canon) && f.status === "pendente" && f.valorLiquido > 0
  )) {
    const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
    console.log(
      `  ${f.mesReferencia} | ficha=${f.valorLiquido} | nota=${nota?.numeroNota ?? "?"} status=${nota?.status ?? "MISSING"} liqNota=${nota?.valorLiquido ?? 0}`
    );
  }

  console.log("\nNotas Orlando (por mês):");
  const notasOrl = data.notasPedido.filter(
    (n) => resolverCooperadoIdCanonico(data, n.cooperadoId, coopId, n.cooperadoNomeSnapshot) === canon
  );
  const byMes = new Map<string, typeof notasOrl>();
  for (const n of notasOrl) {
    const list = byMes.get(n.mesReferencia) ?? [];
    list.push(n);
    byMes.set(n.mesReferencia, list);
  }
  for (const mes of [...byMes.keys()].sort().reverse()) {
    const quitado = cooperadoMesQuitado(data, ORLANDO, mes);
    const r = getResumoMesEntregasCooperado(data, ORLANDO, mes, coopId);
    const rb = bicCentralListarResumosMensaisEntregas(data, ORLANDO, coopId).find((x) => x.mesReferencia === mes);
    console.log(
      `\n  ${mes} | quitado=${quitado} | aReceber=${r.valorAReceber} | recebido=${r.valorRecebido} | BIC mes aReceber=${rb?.valorAReceber ?? "?"}`
    );
    for (const n of byMes.get(mes)!.sort((a, b) => b.dataEntrega.localeCompare(a.dataEntrega))) {
      console.log(
        `    ${n.numeroNota} | ${n.status} | liq=${n.valorLiquido} | ${n.dataEntrega.slice(0, 10)}`
      );
    }
  }

  console.log("\nValores avulsos pendentes:");
  for (const v of (data.valoresAvulsosReceber ?? []).filter(
    (v) => (v.cooperadoId === ORLANDO || v.cooperadoId === canon) && v.status === "pendente"
  )) {
    console.log(`  ${v.mesReferencia} | ${v.valor} | ${v.motivo}`);
  }

  const mes = "2026-09";
  const rel = getResumoValorAPagarRelatorio(data, ORLANDO, mes, coopId);
  const base = getResumoPagamentoCooperado(data, ORLANDO, mes, coopId);
  const pAg = getPagamentoAguardandoCooperado(data, ORLANDO, mes);
  const pOk = getPagamentoConfirmadoCooperadoMes(data, ORLANDO, mes);
  console.log("\n=== Set/2026 detalhe ===");
  console.log("PIX confirmado:", pOk ? `${pOk.valorLiquido} (${pOk.id})` : "nenhum");
  console.log(
    "PIX aguardando:",
    pAg
      ? `liq=${pAg.valorLiquido} notaIds=${JSON.stringify(pAg.notaPedidoIds ?? [])} fichaIds=${JSON.stringify(pAg.fichaIds ?? [])}`
      : "nenhum"
  );
  console.log("Relatório valorLiquido:", rel.valorLiquido);
  console.log("Base valorEntregas:", base.valorEntregas, "valorLiquido base:", base.valorLiquido);
  console.log(
    "Descontos extras:",
    rel.descontosExtras.map((d) => `${d.tipo}=${d.valor} (${d.motivo?.slice(0, 40) ?? ""})`)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
