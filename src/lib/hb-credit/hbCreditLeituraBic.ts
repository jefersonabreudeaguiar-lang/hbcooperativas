/**
 * HB Créditos — leitura financeira alinhada ao hub BIC (mesma projeção cooperado/responsável).
 * Somente leitura; não altera ledger HB nem AppData.
 */
import type { AppData } from "@/types";
import {
  cooperadoMesQuitado,
} from "@/services/cooperadoEntregasService";
import {
  bicCentralListarMesesPendentesQuantoVouReceber,
  bicCentralMesPrincipalQuantoVouReceber,
  bicCentralResolveInicioParaExibicao,
  bicCentralValorAReceberAgregado,
} from "@/services/bicLeituraCentralCooperado";
import { listarFichasPendentesPagamento } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import {
  listCooperadoIdsMesmoTitular,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import {
  getMesesReferenciaPagamento,
  getPagamentoConfirmadoCooperadoMes,
  getResumoValorAPagarRelatorio,
} from "@/services/notaPedidoService";

const HB_CREDIT_APRESENTACAO: { apresentacaoConsolidada: true } = { apresentacaoConsolidada: true };

/** Início “A receber” — mesma projeção BIC usada na UI (consolidada = valores definitivos para limite). */
export function hbCreditInicioParaBase(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
) {
  return bicCentralResolveInicioParaExibicao(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
}

/** M6 agregado BIC — referência cruzada responsável × cooperado. */
export function hbCreditValorAReceberAgregado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
) {
  return bicCentralValorAReceberAgregado(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
}

/** Meses em aberto — união BIC (M6) + visão responsável + PIX aguardando (cooperado = responsável). */
export function hbCreditMesesReferenciaUnificados(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesFallback?: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = new Set<string>([
    ...bicCentralListarMesesPendentesQuantoVouReceber(data, canonico, cooperativaId, HB_CREDIT_APRESENTACAO),
    ...listarMesesPendentesPagamentoResponsavel(data, canonico, cooperativaId),
  ]);

  const titularIds = new Set(listCooperadoIdsMesmoTitular(data, canonico, cooperativaId));
  for (const p of data.pagamentosCooperado) {
    if (p.status !== "aguardando_confirmacao") continue;
    const pgCanonico = resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId);
    if (!titularIds.has(pgCanonico) && p.cooperadoId !== canonico) continue;
    for (const mes of getMesesReferenciaPagamento(p)) {
      meses.add(mes);
    }
  }

  const abertos = [...meses]
    .filter((mes) => !cooperadoMesQuitado(data, canonico, mes))
    .filter((mes) => !getPagamentoConfirmadoCooperadoMes(data, canonico, mes))
    .sort();

  if (abertos.length) return abertos;

  const fallback =
    mesFallback?.trim() ||
    bicCentralMesPrincipalQuantoVouReceber(data, canonico, cooperativaId, HB_CREDIT_APRESENTACAO);
  return fallback ? [fallback] : [];
}

/** Mês principal BIC (consolidado) — fallback cooperado/responsável. */
export function hbCreditMesPrincipal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string {
  return bicCentralMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
}

/** Valor líquido do mês (abatimento HB / fingerprint) — mesma regra do relatório responsável. */
export function hbCreditValorLiquidoMes(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): number {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return getResumoValorAPagarRelatorio(data, canonico, mesReferencia, cooperativaId).valorLiquido;
}

/** Crédito-base HB (R$) = M6 agregado BIC (mesmo número do consolidado / “Quanto vou receber”). */
export function hbCreditCreditoBaseReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const m6 = hbCreditValorAReceberAgregado(data, cooperadoId, cooperativaId);
  if (m6.valor <= 0) return 0;
  return round2(m6.valor);
}
