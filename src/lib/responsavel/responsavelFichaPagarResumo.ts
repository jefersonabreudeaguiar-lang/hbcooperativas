/**
 * Resumo na Ficha → Pagar (responsável): prioriza meses pendentes / consolidado em aberto.
 */
import type { AppData } from "@/types";
import type { ConsolidadoFinanceiroCooperado } from "@/services/cooperadoEntregasService";
import { bicCentralGetResumoPagamentoExibicao } from "@/services/bicLeituraCentralFicha";
import {
  resumoFromPagamento,
  type AjustesResumoPagamento,
  type ResumoPagamentoCooperado,
} from "@/services/notaPedidoService";
import type { PagamentoCooperadoRegistro } from "@/types";

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

  if (resumoPagamentoConsolidado) {
    return resumoPagamentoConsolidado;
  }

  if (
    financeiroAberto &&
    financeiroAberto.valorLiquido > 0.005 &&
    mesesPendentesPagamento.length > 0
  ) {
    return financeiroAberto.resumo;
  }

  if (fluxoReciboAssinatura && pagamentoAguardando && mesesPendentesPagamento.length === 0) {
    return resumoFromPagamento(pagamentoAguardando);
  }

  if (mesesPendentesPagamento.length > 0) {
    const mes = mesesPendentesPagamento[mesesPendentesPagamento.length - 1] ?? mesAtivo;
    return bicCentralGetResumoPagamentoExibicao(
      data,
      cooperadoId,
      mes,
      cooperativaId,
      resumoAjustes
    );
  }

  return null;
}
