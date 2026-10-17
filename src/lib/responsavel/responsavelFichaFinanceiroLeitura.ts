/**
 * Leitura financeira estável na Ficha do responsável (aba Pagar).
 * Evita alternar entre snapshot de pagamento quitado, vazio transitório e consolidado em aberto.
 */
import type { AppData } from "@/types";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import type { ConsolidadoFinanceiroCooperado } from "@/services/cooperadoEntregasService";
import { bicCentralGetResumoPagamentoExibicao } from "@/services/bicLeituraCentralFicha";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import {
  resumoFromPagamento,
  type AjustesResumoPagamento,
  type ResumoPagamentoCooperado,
} from "@/services/notaPedidoService";
import type { PagamentoCooperadoRegistro } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";

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

/** Badge da fila Pagar — mesma base de CNPJ que lista de pendentes (evita flip async). */
export function responsavelBadgeFilaPagarCount(opts: {
  cooperadosParaPagarCount: number;
  aguardandoAssinaturaCount: number;
  aguardandoVerificacaoCount: number;
  cnpjDigits: string;
}): number {
  const aguard = opts.aguardandoAssinaturaCount;
  const verif = opts.aguardandoVerificacaoCount;
  if (opts.cnpjDigits && isOperacionalCloudAuthoritative(opts.cnpjDigits)) {
    return aguard + verif;
  }
  return opts.cooperadosParaPagarCount + aguard + verif;
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

/**
 * Prioriza consolidado em aberto (mesma lista de meses pendentes).
 * Retorna null para seguir o fluxo legado (histórico / ficha).
 */
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
