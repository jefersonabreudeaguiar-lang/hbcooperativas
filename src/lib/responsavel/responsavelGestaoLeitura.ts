/**
 * Leitura unificada do painel responsável (totais, Ficha Pagar, fila do dia).
 */
import type { AppData } from "@/types";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import type { ConsolidadoFinanceiroCooperado } from "@/services/cooperadoEntregasService";
import { mesReferenciaPagamentoResponsavelEmAberto } from "@/services/cooperadoEntregasService";
import { bicCentralGetResumoPagamentoExibicao } from "@/services/bicLeituraCentralFicha";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import {
  getResumoPagamentoConsolidadoCooperado,
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

/** Badge Ficha Pagar + fila do dia — mesma regra quando operacional na nuvem é autoritativo. */
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

export function responsavelInboxCooperadosPagarCount(
  cooperadosParaPagarCount: number,
  _cnpjDigits?: string
): number {
  return cooperadosParaPagarCount;
}

/**
 * Total «a pagar» do Início / relatórios / Em aberto.
 * Só meses ainda em aberto (PIX confirmado + débito no caixa sai da soma).
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
      return s + hbCreditCreditoBaseReais(data, c.id, coopScope);
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
