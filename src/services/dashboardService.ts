import type { AppData, FechamentoMensal, FinanceiroMensal } from "@/types";
import { bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { getData, getDataRevision } from "@/services/dataStore";
import {
  getTotalAPagarCooperado,
  getTotalRecebidoCooperado,
  pagamentoCobreMesReferencia,
  pagamentoRegistradoParaRelatorio,
} from "@/services/notaPedidoService";
import { sumBy } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";
import {
  computeAdminStatsPure,
  type AdminDashboardStats,
} from "@/lib/performance/adminStatsComputeCore";
import {
  calcularFechamentoMensalLive,
  fechamentoToPartial,
  getRelatorioEntregasInstituicaoLive,
  getRelatorioEntregasPorItensInstituicao,
  getRelatorioEntregasPorItensEmAberto,
  getRelatorioEntregasPorItensPeriodo,
  getRelatorioMensalidadesEmAbertoConsolidado,
  getRelatorioPagarCooperado,
  getRelatorioPagarCooperadoEmAberto,
  getRelatorioPNAELive,
  getRelatorioResumoFinanceiroEmAberto,
  getResumoFinanceiroMes,
  getTotalValoresAPagarEmAberto,
  listMesesComLancamentos,
  listarMesesComDebitoCooperativa,
} from "@/services/relatorioService";

export interface CooperadoDashboardStats {
  valorAReceber: number;
  valorRecebido: number;
  valorPendente: number;
  mensalidadesAbertas: number;
  cotasPendentes: number;
  descontosAplicados: number;
  totalEntregueMes: number;
  totalVendidoAno: number;
  statusFinanceiro: "em_dia" | "pendente" | "com_debito";
}

export type { AdminDashboardStats };

function filterByMes<T>(items: T[], getter: (item: T) => string, mes: string): T[] {
  return items.filter((item) => getter(item).startsWith(mes));
}

function filterByAno<T>(items: T[], getter: (item: T) => string, ano: string): T[] {
  return items.filter((item) => getter(item).startsWith(ano));
}

export function getCooperadoStats(cooperadoId: string, data?: AppData): CooperadoDashboardStats {
  const d = data ?? getData();
  const mes = getCurrentMesReferencia();
  const ano = mes.split("-")[0];

  const pagamentos = d.pagamentos.filter((p) => p.cooperadoId === cooperadoId);
  const mensalidades = d.mensalidades.filter((m) => m.cooperadoId === cooperadoId);
  const cotas = d.cotas.filter((c) => c.cooperadoId === cooperadoId);
  const entregas = d.entregas.filter((e) => e.cooperadoId === cooperadoId);
  const descontos = d.descontos.filter((dc) => dc.cooperadoId === cooperadoId);
  const coopId = d.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;

  const valorAReceber = isBicCentralReadAuthorityEnabled()
    ? bicCentralValorAReceberAgregado(d, cooperadoId, coopId).valor
    : getTotalAPagarCooperado(d, cooperadoId, mes, coopId);
  const valorRecebido = getTotalRecebidoCooperado(d, cooperadoId, mes);
  const valorPendente = valorAReceber;

  const mensalidadesAbertas = mensalidades.filter(
    (m) => m.status === "pendente" || m.status === "atrasada" || m.status === "parcelada"
  ).length;

  const cotasPendentes = cotas.filter(
    (c) => c.status !== "quitada"
  ).length;

  const descontosAplicados = sumBy(descontos, (dc) => dc.valorDescontado);

  const totalEntregueMes = sumBy(
    filterByMes(d.notasPedido.filter((n) => n.cooperadoId === cooperadoId && n.status === "conferida"), (n) => n.dataEntrega, mes),
    (n) => n.valorBruto
  );

  const totalVendidoAno = sumBy(
    filterByAno(d.notasPedido.filter((n) => n.cooperadoId === cooperadoId && (n.status === "conferida" || n.status === "pago")), (n) => n.dataEntrega, ano),
    (n) => n.valorBruto
  );

  const temAtrasada = mensalidades.some((m) => m.status === "atrasada") || cotas.some((c) => c.status === "atrasada");
  const temPendente = mensalidades.some((m) => m.status === "pendente" || m.status === "parcelada") || cotas.some((c) => c.status !== "quitada");

  let statusFinanceiro: "em_dia" | "pendente" | "com_debito" = "em_dia";
  if (temAtrasada) statusFinanceiro = "com_debito";
  else if (temPendente) statusFinanceiro = "pendente";

  return {
    valorAReceber,
    valorRecebido,
    valorPendente,
    mensalidadesAbertas,
    cotasPendentes,
    descontosAplicados,
    totalEntregueMes,
    totalVendidoAno,
    statusFinanceiro,
  };
}

export function getAdminStats(
  data?: AppData,
  cooperativaId?: string,
  opts?: { skipValoresAPagar?: boolean }
): AdminDashboardStats {
  const d = data ?? getData();
  return computeAdminStatsPure(d, cooperativaId, opts, {
    bicCentralRead: isBicCentralReadAuthorityEnabled(),
  });
}

type AdminStatsCache = {
  revision: number;
  coopKey: string;
  skipValores: boolean;
  stats: AdminDashboardStats;
};

let adminStatsCache: AdminStatsCache | null = null;

/** Cache por revisão AppData — evita recomputar BIC × N cooperados a cada render do painel. */
export function getAdminStatsCached(
  data: AppData,
  cooperativaId?: string,
  opts?: { skipValoresAPagar?: boolean }
): AdminDashboardStats {
  const revision = getDataRevision();
  const coopKey = cooperativaId ?? "";
  const skipValores = opts?.skipValoresAPagar === true;
  if (
    adminStatsCache &&
    adminStatsCache.revision === revision &&
    adminStatsCache.coopKey === coopKey &&
    adminStatsCache.skipValores === skipValores
  ) {
    return adminStatsCache.stats;
  }
  const stats = getAdminStats(data, cooperativaId, opts);
  adminStatsCache = { revision, coopKey, skipValores, stats };
  return stats;
}

export function resetAdminStatsCacheForTests(): void {
  adminStatsCache = null;
}

/** Preenche cache após cálculo assíncrono (RQL 8.5 worker). */
export function seedAdminStatsCache(
  stats: AdminDashboardStats,
  revision: number,
  coopKey: string,
  skipValores: boolean
): void {
  adminStatsCache = { revision, coopKey, skipValores, stats };
}

export function calcularFechamentoMensal(mesReferencia: string, data?: AppData): Partial<FechamentoMensal> {
  const d = data ?? getData();
  return fechamentoToPartial(calcularFechamentoMensalLive(mesReferencia, d));
}

export function getRelatorioResumoFinanceiro(mesReferencia: string, data?: AppData) {
  const d = data ?? getData();
  const r = getResumoFinanceiroMes(mesReferencia, d);
  const pagamentosMes = d.pagamentosCooperado.filter((p) => pagamentoCobreMesReferencia(p, mesReferencia));
  return {
    mesReferencia,
    financeiro: d.financeiro.find((f) => f.mesReferencia === mesReferencia),
    totalVendas: r.totalVendasBruto,
    totalLiquido: r.totalVendasLiquido,
    pagamentosPendentes: pagamentosMes.filter((p) => p.status === "aguardando_confirmacao"),
    pagamentosRealizados: pagamentosMes.filter((p) => pagamentoRegistradoParaRelatorio(p)),
    resumo: r,
  };
}

export function getRelatorioPorCooperado(cooperadoId: string, data?: AppData) {
  const d = data ?? getData();
  return {
    cooperado: d.cooperados.find((c) => c.id === cooperadoId),
    entregas: d.entregas.filter((e) => e.cooperadoId === cooperadoId),
    pagamentos: d.pagamentos.filter((p) => p.cooperadoId === cooperadoId),
    mensalidades: d.mensalidades.filter((m) => m.cooperadoId === cooperadoId),
    cotas: d.cotas.filter((c) => c.cooperadoId === cooperadoId),
    descontos: d.descontos.filter((dc) => dc.cooperadoId === cooperadoId),
  };
}

export function getRelatorioEntregasPorInstituicao(instituicaoId: string, mesReferencia: string, data?: AppData) {
  const d = data ?? getData();
  return getRelatorioEntregasInstituicaoLive(mesReferencia, instituicaoId, d);
}

export function getRelatorioPNAE(mesReferencia: string, data?: AppData) {
  const d = data ?? getData();
  return getRelatorioPNAELive(mesReferencia, d);
}

export function getRelatorioEntregasPorItens(
  instituicaoId: string,
  mesReferencia: string,
  data?: AppData,
  cooperativaId?: string
) {
  const d = data ?? getData();
  return getRelatorioEntregasPorItensInstituicao(mesReferencia, instituicaoId, d, cooperativaId);
}

export function getRelatorioEntregasPorItensPeriodoReport(
  instituicaoId: string,
  mesesReferencia: string[],
  data?: AppData,
  cooperativaId?: string,
  opcoes?: { apenasPendente?: boolean }
) {
  const d = data ?? getData();
  return getRelatorioEntregasPorItensPeriodo(instituicaoId, mesesReferencia, d, cooperativaId, opcoes);
}

export function getRelatorioEntregasPorItensEmAbertoReport(
  instituicaoId: string,
  data?: AppData,
  cooperativaId?: string
) {
  const d = data ?? getData();
  return getRelatorioEntregasPorItensEmAberto(instituicaoId, d, cooperativaId);
}

export function getRelatorioResumoFinanceiroEmAbertoReport(data?: AppData, cooperativaId?: string) {
  const d = data ?? getData();
  return getRelatorioResumoFinanceiroEmAberto(d, cooperativaId);
}

export function getRelatorioMensalidadesEmAbertoConsolidadoReport(data?: AppData, cooperativaId?: string) {
  const d = data ?? getData();
  return getRelatorioMensalidadesEmAbertoConsolidado(d, cooperativaId);
}

export function getRelatorioPagarCooperadoEmAbertoReport(
  data?: AppData,
  cooperativaId?: string,
  cooperadoId?: string
) {
  const d = data ?? getData();
  return getRelatorioPagarCooperadoEmAberto(d, cooperativaId, cooperadoId);
}

export { getRelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
export { getRelatorioAtingimentoCronograma } from "@/services/relatorioCronogramaService";

export { listMesesComLancamentos, getRelatorioPagarCooperado, getRelatorioPagarCooperadoEmAberto, calcularFechamentoMensalLive, getRelatorioResumoFinanceiroEmAberto, getRelatorioEntregasPorItensEmAberto, getRelatorioMensalidadesEmAbertoConsolidado, listarMesesComDebitoCooperativa, getTotalValoresAPagarEmAberto };

export function getFinanceiroResumoCooperado(data?: AppData): Pick<FinanceiroMensal, "saldoFinal" | "entradas" | "saidas" | "dataAtualizacao"> | null {
  const d = data ?? getData();
  const mes = getCurrentMesReferencia();
  const fin = d.financeiro.find((f) => f.mesReferencia === mes);
  if (!fin) return null;
  return {
    saldoFinal: fin.saldoFinal,
    entradas: fin.entradas,
    saidas: fin.saidas,
    dataAtualizacao: fin.dataAtualizacao,
  };
}

export function exportToCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return lines.join("\n");
}

export function downloadCSV(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
