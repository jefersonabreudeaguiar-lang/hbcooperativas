/**
 * Leitura unificada do painel responsável (totais, Ficha Pagar, fila do dia).
 */
import type { AppData } from "@/types";
import type { AppDataNotifyDomain } from "@/lib/performance/appDataDomainNotify";
import { isBicCentralReadAuthorityEnabled } from "@/lib/bic/bicCentralReadAuthority";
import { bicCentralValorAReceberAgregado } from "@/services/bicLeituraCentralCooperado";
import { projetarAppDataFinanceiroParaCreditoBase } from "@/modules/hb-credit/engine/projetarAppDataFinanceiroParaCreditoBase";
import type { ConsolidadoFinanceiroCooperado } from "@/services/cooperadoEntregasService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import { bicCentralGetResumoPagamentoExibicao } from "@/services/bicLeituraCentralFicha";
import { isOperacionalCloudAuthoritative } from "@/services/operationalReset";
import {
  getTotalAPagarCooperado,
  resumoFromPagamento,
  type AjustesResumoPagamento,
  type ResumoPagamentoCooperado,
} from "@/services/notaPedidoService";
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
  cnpjDigits: string
): number {
  if (cnpjDigits && isOperacionalCloudAuthoritative(cnpjDigits)) {
    return 0;
  }
  return cooperadosParaPagarCount;
}

/** Total «a pagar» — mesma base do dashboard admin e relatórios em aberto. */
export function getTotalValoresAPagarGestaoCooperativa(
  data: AppData,
  cooperativaId?: string,
  opts?: { bicCentralRead?: boolean }
): number {
  const bic = opts?.bicCentralRead ?? isBicCentralReadAuthorityEnabled();
  const cooperados = cooperativaId
    ? data.cooperados.filter((c) => c.status === "ativo" && c.cooperativaId === cooperativaId)
    : data.cooperados.filter((c) => c.status === "ativo");

  if (bic) {
    const cnpjDigits = cooperativaId
      ? cooperativaCnpjDigitsFromAppData(data, cooperativaId)
      : data.cooperativas
          .map((c) => normalizeCnpj(c.cnpj ?? ""))
          .find((d) => d.length === 14);
    const base = projetarAppDataFinanceiroParaCreditoBase(data, cnpjDigits);
    return round2(
      cooperados.reduce(
        (s, c) => s + bicCentralValorAReceberAgregado(base, c.id, c.cooperativaId).valor,
        0
      )
    );
  }

  return round2(
    cooperados.reduce((s, c) => {
      const coopScope = cooperativaId ?? c.cooperativaId;
      const meses = listarMesesPendentesPagamentoResponsavel(data, c.id, coopScope);
      let sub = 0;
      for (const mes of meses) {
        sub += getTotalAPagarCooperado(data, c.id, mes, coopScope);
      }
      return s + sub;
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
