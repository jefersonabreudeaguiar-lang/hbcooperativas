/**
 * Leitura unificada do painel responsável (totais, Ficha Pagar, fila do dia).
 */
import type { AppData } from "@/types";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import type { ConsolidadoFinanceiroCooperado } from "@/services/cooperadoEntregasService";
import { mesReferenciaPagamentoResponsavelEmAberto } from "@/services/cooperadoEntregasService";
import { bicCentralGetResumoPagamentoExibicao } from "@/services/bicLeituraCentralFicha";
import { staffCooperadoLeituraFinanceiraExibicao } from "@/lib/bic/bicStaffLeituraCooperado";
import {
  getResumoPagamentoConsolidadoCooperado,
  notaQuitadaPorPagamentoCooperativaRegistrado,
  resumoFromPagamento,
  type AjustesResumoPagamento,
  type ResumoPagamentoCooperado,
} from "@/services/notaPedidoService";
import { hbCreditCreditoBaseReais } from "@/lib/hb-credit/hbCreditCreditoBaseCalculo";
import type { PagamentoCooperadoRegistro } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { round2 } from "@/utils/calculations";

export function responsavelFichaAppDataDomains(isCooperado: boolean): AppDataNotifyDomain[] {
  return isCooperado ? ["financeiro", "shell"] : ["financeiro", "shell", "notas"];
}

export function cooperativaCnpjDigitsFromAppData(
  data: AppData | null | undefined,
  cooperativaId: string | undefined
): string {
  if (!data || !cooperativaId) return "";
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop?.cnpj) return "";
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : "";
}

/** Badge Ficha Pagar + fila do dia — mesma conta de quem tem valor real a receber. */
export function responsavelBadgeFilaPagarCount(opts: {
  cooperadosParaPagarCount: number;
  aguardandoAssinaturaCount: number;
  aguardandoVerificacaoCount: number;
  cnpjDigits: string;
}): number {
  return (
    opts.cooperadosParaPagarCount +
    opts.aguardandoAssinaturaCount +
    opts.aguardandoVerificacaoCount
  );
}

export function responsavelInboxCooperadosPagarCount(
  cooperadosParaPagarCount: number,
  _cnpjDigits?: string
): number {
  return cooperadosParaPagarCount;
}

function somaNotasConferidasSemPix(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): number {
  let total = 0;
  for (const n of data.notasPedido ?? []) {
    if (n.cooperativaId !== cooperativaId) continue;
    if (n.cooperadoId !== cooperadoId) continue;
    if (n.status !== "conferida") continue;
    if (notaQuitadaPorPagamentoCooperativaRegistrado(data, n, cooperadoId)) continue;
    const liq = Number(n.valorLiquido);
    const bruto = Number(n.valorBruto);
    const valor = liq > 0.005 ? liq : bruto > 0.005 ? bruto : 0;
    if (valor > 0.005) total = round2(total + valor);
  }
  return total;
}

/**
 * Total «a pagar» do Início / relatórios.
 * Ficha em aberto; se a ficha ainda não gravou, usa o líquido da nota conferida sem PIX.
 */
export function getTotalValoresAPagarGestaoCooperativa(
  data: AppData,
  cooperativaId?: string,
  _opts?: { bicCentralRead?: boolean }
): number {
  const cooperados = cooperativaId
    ? data.cooperados.filter((c) => c.status === "ativo" && c.cooperativaId === cooperativaId)
    : data.cooperados.filter((c) => c.status === "ativo");

  return round2(
    cooperados.reduce((s, c) => {
      const coopScope = cooperativaId ?? c.cooperativaId;
      const ficha = hbCreditCreditoBaseReais(data, c.id, coopScope);
      if (ficha > 0.005) return s + ficha;
      if (!coopScope) return s;
      return s + somaNotasConferidasSemPix(data, c.id, coopScope);
    }, 0)
  );
}

export type PickResumoStaffFichaPagarInput = {
  data: AppData;
  cooperadoId: string;
  cooperativaId?: string;
  mesesPendentesPagamento: string[];
  resumoPagamentoConsolidado: ResumoPagamentoCooperado | null;
  financeiroAberto: ConsolidadoFinanceiroCooperado | null;
  pagamentoAguardando?: PagamentoCooperadoRegistro;
  mesAtivo: string;
  resumoAjustes?: AjustesResumoPagamento;
  fluxoReciboAssinatura: boolean;
};

export function pickResumoStaffFichaPagar(
  input: PickResumoStaffFichaPagarInput
): ResumoPagamentoCooperado | null {
  const {
    data,
    cooperadoId,
    cooperativaId,
    mesesPendentesPagamento,
    resumoPagamentoConsolidado,
    financeiroAberto,
    pagamentoAguardando,
    mesAtivo,
    resumoAjustes,
    fluxoReciboAssinatura,
  } = input;

  const mesesEmAberto = mesesPendentesPagamento.filter((mes) =>
    mesReferenciaPagamentoResponsavelEmAberto(data, cooperadoId, mes, cooperativaId)
  );

  const bic = staffCooperadoLeituraFinanceiraExibicao(data, cooperadoId, cooperativaId);
  if (mesesEmAberto.length > 0 && bic.valorLiquido > 0.005 && bic.resumo.valorLiquido > 0.005) {
    return bic.resumo;
  }

  const ajustesPorMes: Record<string, AjustesResumoPagamento> | undefined =
    resumoAjustes && mesAtivo ? { [mesAtivo]: resumoAjustes } : undefined;

  if (mesesEmAberto.length > 1) {
    const consolidado = getResumoPagamentoConsolidadoCooperado(
      data,
      cooperadoId,
      mesesEmAberto,
      cooperativaId,
      ajustesPorMes
    );
    if (consolidado.valorLiquido > 0.005) return consolidado;
  }

  if (mesesEmAberto.length === 1) {
    const mes = mesesEmAberto[0]!;
    const exibicao = bicCentralGetResumoPagamentoExibicao(
      data,
      cooperadoId,
      mes,
      cooperativaId,
      resumoAjustes
    );
    if (exibicao.valorLiquido > 0.005) return exibicao;
  }

  if (
    resumoPagamentoConsolidado &&
    mesesEmAberto.length === mesesPendentesPagamento.length &&
    resumoPagamentoConsolidado.valorLiquido > 0.005
  ) {
    return resumoPagamentoConsolidado;
  }

  if (
    financeiroAberto &&
    financeiroAberto.valorLiquido > 0.005 &&
    mesesEmAberto.length > 0
  ) {
    return financeiroAberto.resumo;
  }

  if (fluxoReciboAssinatura && pagamentoAguardando && mesesEmAberto.length === 0) {
    return resumoFromPagamento(pagamentoAguardando);
  }

  return null;
}
