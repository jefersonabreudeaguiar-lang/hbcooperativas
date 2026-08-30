import type { AppData, FechamentoMensal, FinanceiroMensal } from "@/types";
import { getData } from "@/services/dataStore";
import { getTotalAPagarCooperado, getTotalRecebidoCooperado, idsNotasPedidoExcluidas } from "@/services/notaPedidoService";
import { round2, sumBy } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";
import { isNotaNaFilaConferenciaResponsavel } from "@/utils/notaStatus";
import {
  calcularFechamentoMensalLive,
  fechamentoToPartial,
  getRelatorioEntregasInstituicaoLive,
  getRelatorioEntregasPorItensInstituicao,
  getRelatorioPagarCooperado,
  getRelatorioPNAELive,
  getResumoFinanceiroMes,
  listMesesComLancamentos,
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

export interface AdminDashboardStats {
  totalVendidoMes: number;
  totalVendidoAno: number;
  valoresAPagar: number;
  valoresPagos: number;
  saldoCooperativa: number;
  mensalidadesRecebidas: number;
  cotasRecebidas: number;
  debitosAbertos: number;
  cooperadosAtivos: number;
  entregasPendentes: number;
  pagamentosPendentes: number;
}

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

  const valorAReceber = getTotalAPagarCooperado(d, cooperadoId, mes, coopId);
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

export function getAdminStats(data?: AppData): AdminDashboardStats {
  const d = data ?? getData();
  const mes = getCurrentMesReferencia();
  const ano = mes.split("-")[0];

  const entregasMes = filterByMes(
    d.notasPedido.filter((n) => n.status === "conferida" || n.status === "pago"),
    (n) => n.dataEntrega,
    mes
  );
  const entregasAno = filterByAno(
    d.notasPedido.filter((n) => n.status === "conferida" || n.status === "pago"),
    (n) => n.dataEntrega,
    ano
  );

  const financeiroMes = d.financeiro.find((f) => f.mesReferencia === mes);

  const pagamentosPendentes = d.fichaCorrida.filter((f) => f.status === "pendente");
  const pagamentosPagos = d.fichaCorrida.filter((f) => f.status === "pago");
  const excluidas = idsNotasPedidoExcluidas(d);
  const notasAguardando = d.notasPedido.filter(
    (n) => isNotaNaFilaConferenciaResponsavel(n.status) && !excluidas.has(n.id)
  );

  const mensalidadesAbertas = d.mensalidades.filter((m) => m.status === "pendente" || m.status === "atrasada");
  const cotasAbertas = d.cotas.filter((c) => c.status !== "quitada");

  const valoresAPagar = round2(
    d.cooperados.reduce(
      (s, c) => s + getTotalAPagarCooperado(d, c.id, undefined, c.cooperativaId),
      0
    )
  );

  return {
    totalVendidoMes: sumBy(entregasMes, (e) => e.valorBruto),
    totalVendidoAno: sumBy(entregasAno, (e) => e.valorBruto),
    valoresAPagar,
    valoresPagos: sumBy(pagamentosPagos, (f) => f.valorLiquido),
    saldoCooperativa: financeiroMes?.saldoFinal ?? 0,
    mensalidadesRecebidas: financeiroMes?.mensalidadesRecebidas ?? 0,
    cotasRecebidas: financeiroMes?.cotasRecebidas ?? 0,
    debitosAbertos: sumBy(mensalidadesAbertas, (m) => m.valor) + sumBy(cotasAbertas, (c) => c.valorParcela * c.parcelasPendentes),
    cooperadosAtivos: d.cooperados.filter((c) => c.status === "ativo").length,
    entregasPendentes: notasAguardando.length,
    pagamentosPendentes: pagamentosPendentes.length,
  };
}

export function calcularFechamentoMensal(mesReferencia: string, data?: AppData): Partial<FechamentoMensal> {
  const d = data ?? getData();
  return fechamentoToPartial(calcularFechamentoMensalLive(mesReferencia, d));
}

export function getRelatorioResumoFinanceiro(mesReferencia: string, data?: AppData) {
  const d = data ?? getData();
  const r = getResumoFinanceiroMes(mesReferencia, d);
  const pagamentosMes = d.pagamentosCooperado.filter((p) => p.mesReferencia === mesReferencia);
  return {
    mesReferencia,
    financeiro: d.financeiro.find((f) => f.mesReferencia === mesReferencia),
    totalVendas: r.totalVendasBruto,
    totalLiquido: r.totalVendasLiquido,
    pagamentosPendentes: pagamentosMes.filter((p) => p.status === "aguardando_confirmacao"),
    pagamentosRealizados: pagamentosMes.filter((p) => p.status === "confirmado"),
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

export { getRelatorioSobrasPerdas } from "@/services/sobrasPerdasService";
export { getRelatorioAtingimentoCronograma } from "@/services/relatorioCronogramaService";

export { listMesesComLancamentos, getRelatorioPagarCooperado, calcularFechamentoMensalLive };

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
