/**
 * RQL 8.5 — cálculo puro de stats do painel gestão (main thread ou Web Worker).
 */
import type { AppData } from "@/types";
import { bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import { projetarAppDataFinanceiroParaCreditoBase } from "@/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  fichaNotaElegivelParaPagamento,
  idsNotasPedidoExcluidas,
} from "@/services/notaPedidoService";
import { round2, sumBy } from "@/utils/calculations";
import { getCurrentMesReferencia } from "@/utils/format";
import { isNotaNaFilaConferenciaResponsavel } from "@/utils/notaStatus";
import { notaPertenceCooperativa } from "@/utils/fotoEntrega";
import { countNotasFilaConferenciaResponsavel } from "@/services/responsavelPainelIndex";
import { getTotalValoresAPagarEmAberto } from "@/services/relatorioService";

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

export type AdminStatsComputeEnv = {
  bicCentralRead: boolean;
};

function filterByMes<T>(items: T[], getter: (item: T) => string, mes: string): T[] {
  return items.filter((item) => getter(item).startsWith(mes));
}

function filterByAno<T>(items: T[], getter: (item: T) => string, ano: string): T[] {
  return items.filter((item) => getter(item).startsWith(ano));
}

function cnpjDigitsForCooperativa(d: AppData, cooperativaId?: string): string | undefined {
  if (!cooperativaId) {
    const d0 = d.cooperativas.map((c) => normalizeCnpj(c.cnpj ?? "")).find((x) => x.length === 14);
    return d0;
  }
  const coop = d.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop?.cnpj) return undefined;
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : undefined;
}

/** Mesma lógica de `getAdminStats`, com flag BIC explícita (worker não lê `process.env`). */
export function computeAdminStatsPure(
  d: AppData,
  cooperativaId?: string,
  opts?: { skipValoresAPagar?: boolean },
  env: AdminStatsComputeEnv = { bicCentralRead: false }
): AdminDashboardStats {
  const mes = getCurrentMesReferencia();
  const ano = mes.split("-")[0];

  const cooperadosEscopo = cooperativaId
    ? d.cooperados.filter((c) => c.cooperativaId === cooperativaId)
    : d.cooperados;
  const coopCooperadoIds = cooperativaId ? new Set(cooperadosEscopo.map((c) => c.id)) : null;
  const notaNoEscopo = (n: (typeof d.notasPedido)[number]) =>
    !cooperativaId || notaPertenceCooperativa(d, n, cooperativaId);
  const pertenceCoop = (cooperadoId: string) => !coopCooperadoIds || coopCooperadoIds.has(cooperadoId);

  const entregasMes = filterByMes(
    d.notasPedido.filter((n) => (n.status === "conferida" || n.status === "pago") && notaNoEscopo(n)),
    (n) => n.dataEntrega,
    mes
  );
  const entregasAno = filterByAno(
    d.notasPedido.filter((n) => (n.status === "conferida" || n.status === "pago") && notaNoEscopo(n)),
    (n) => n.dataEntrega,
    ano
  );

  const financeiroMes = d.financeiro.find((f) => f.mesReferencia === mes);

  const pagamentosPendentes = d.fichaCorrida.filter(
    (f) => f.status === "pendente" && pertenceCoop(f.cooperadoId) && fichaNotaElegivelParaPagamento(d, f)
  );
  const pagamentosPagos = d.fichaCorrida.filter((f) => f.status === "pago" && pertenceCoop(f.cooperadoId));
  const excluidas = idsNotasPedidoExcluidas(d, cooperativaId);
  const entregasPendentes = cooperativaId
    ? countNotasFilaConferenciaResponsavel(d, cooperativaId)
    : d.notasPedido.filter(
        (n) => isNotaNaFilaConferenciaResponsavel(n.status) && notaNoEscopo(n) && !excluidas.has(n.id)
      ).length;

  const mensalidadesAbertas = d.mensalidades.filter(
    (m) => (m.status === "pendente" || m.status === "atrasada") && pertenceCoop(m.cooperadoId)
  );
  const cotasAbertas = d.cotas.filter((c) => c.status !== "quitada" && pertenceCoop(c.cooperadoId));

  const valoresAPagar = opts?.skipValoresAPagar
    ? 0
    : env.bicCentralRead
      ? (() => {
          const base = projetarAppDataFinanceiroParaCreditoBase(d, cnpjDigitsForCooperativa(d, cooperativaId));
          return round2(
            cooperadosEscopo.reduce((s, c) => {
              return s + bicCentralValorAReceberAgregado(base, c.id, c.cooperativaId).valor;
            }, 0)
          );
        })()
      : getTotalValoresAPagarEmAberto(d, cooperativaId);

  return {
    totalVendidoMes: sumBy(entregasMes, (e) => e.valorBruto),
    totalVendidoAno: sumBy(entregasAno, (e) => e.valorBruto),
    valoresAPagar,
    valoresPagos: sumBy(pagamentosPagos, (f) => f.valorLiquido),
    saldoCooperativa: financeiroMes?.saldoFinal ?? 0,
    mensalidadesRecebidas: financeiroMes?.mensalidadesRecebidas ?? 0,
    cotasRecebidas: financeiroMes?.cotasRecebidas ?? 0,
    debitosAbertos: sumBy(mensalidadesAbertas, (m) => m.valor) + sumBy(cotasAbertas, (c) => c.valorParcela * c.parcelasPendentes),
    cooperadosAtivos: cooperadosEscopo.filter((c) => c.status === "ativo").length,
    entregasPendentes,
    pagamentosPendentes: pagamentosPendentes.length,
  };
}
