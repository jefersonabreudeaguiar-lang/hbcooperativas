/**
 * HB Créditos — leitura financeira alinhada ao hub BIC (mesma projeção cooperado/responsável).
 * Somente leitura; não altera ledger HB nem AppData.
 */
import type { AppData } from "@/types";
import {
  cooperadoMesQuitado,
  getMesPrincipalQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
  listarMesesReferenciaResumoFinanceiroParidade,
} from "@/services/cooperadoEntregasService";
import {
  bicCentralMesPrincipalQuantoVouReceber,
  bicCentralResolveInicioParaExibicao,
  bicCentralValorAReceberAgregado,
} from "@/services/bicLeituraCentralCooperado";
import { listarFichasPendentesPagamento } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import {
  listCooperadoIdsMesmoTitular,
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { listarMesesPendentesPagamentoResponsavel } from "@/services/cooperadoEntregasService";
import {
  getMesesReferenciaPagamento,
  getPagamentoConfirmadoCooperadoMes,
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
} from "@/services/notaPedidoService";

const HB_CREDIT_APRESENTACAO: { apresentacaoConsolidada: true } = { apresentacaoConsolidada: true };

/** Evita spread de export ainda indefinido (ciclo creditBaseFromFicha ↔ BIC no client). */
function hbCreditMesesPendentesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string[] {
  const bicListar = (
    require("@/services/bicLeituraCentralCooperado") as typeof import("@/services/bicLeituraCentralCooperado")
  ).bicCentralListarMesesPendentesQuantoVouReceber;
  if (typeof bicListar === "function") {
    const meses = bicListar(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (Array.isArray(meses)) return meses;
  }
  return listarMesesPendentesQuantoVouReceber(data, cooperadoId, cooperativaId);
}

function hbCreditMesPrincipalFallback(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string {
  const bicMes = (
    require("@/services/bicLeituraCentralCooperado") as typeof import("@/services/bicLeituraCentralCooperado")
  ).bicCentralMesPrincipalQuantoVouReceber;
  if (typeof bicMes === "function") {
    const mes = bicMes(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (mes?.trim()) return mes;
  }
  return getMesPrincipalQuantoVouReceber(data, cooperadoId, cooperativaId);
}

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

function hbCreditMesesFinanceirosAbertos(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = new Set<string>([
    ...hbCreditMesesPendentesQuantoVouReceber(data, canonico, cooperativaId),
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

  return [...meses]
    .filter((mes) => !cooperadoMesQuitado(data, canonico, mes))
    .filter((mes) => !getPagamentoConfirmadoCooperadoMes(data, canonico, mes))
    .sort();
}

/** Meses em aberto — união BIC (M6) + visão responsável + PIX aguardando (cooperado = responsável). */
export function hbCreditMesesReferenciaUnificados(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  mesFallback?: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const abertos = hbCreditMesesFinanceirosAbertos(data, canonico, cooperativaId);
  if (abertos.length) return abertos;

  const fallback =
    mesFallback?.trim() || hbCreditMesPrincipalFallback(data, canonico, cooperativaId);
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

/**
 * Lastro HB (R$) a partir de entregas conferidas/pagas — independe do “A receber” pendente (M6).
 * Usado para teto/cap; não zera quando o mês foi quitado.
 */
export function hbCreditCreditoBaseLastroEntregasReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  let temConferida = false;
  let total = 0;
  for (const nota of data.notasPedido ?? []) {
    if (nota.status !== "conferida" && nota.status !== "pago") continue;
    if (!notaPertenceCooperado(data, nota, canonico, coopId)) continue;
    temConferida = true;
    total += Math.max(0, Number(nota.valorLiquido) || 0);
  }
  if (!temConferida) return 0;
  return round2(total);
}

function mesComBrutoFichaHbAberto(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): boolean {
  if (cooperadoMesQuitado(data, cooperadoId, mesReferencia)) return false;
  if (getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia)) return false;
  const resumo = getResumoPagamentoCooperado(data, cooperadoId, mesReferencia, cooperativaId);
  return resumo.valorBruto > 0;
}

/**
 * Soma do valor bruto da ficha nos meses em aberto (mesma janela de «A receber»).
 * Zera após liquidação do mês ou quando não há entregas pendentes.
 */
export function hbCreditCreditoBaseBrutoFichaAbertoReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return 0;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = hbCreditMesesReferenciaUnificados(data, canonico, coopId);
  let total = 0;
  for (const mes of meses) {
    if (!mesComBrutoFichaHbAberto(data, canonico, mes, coopId)) continue;
    total += getResumoPagamentoCooperado(data, canonico, mes, coopId).valorBruto;
  }
  return round2(total);
}

/** Bruto das fichas status pendente — paridade com «A receber» quando o mês já tem PIX/quitado parcial. */
function hbCreditCreditoBaseBrutoFichasPendentesReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): number {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = new Set<string>([
    ...listarMesesReferenciaResumoFinanceiroParidade(data, canonico, cooperativaId),
    ...hbCreditMesesReferenciaUnificados(data, canonico, cooperativaId),
    ...hbCreditMesesPendentesQuantoVouReceber(data, canonico, cooperativaId),
    ...listarMesesPendentesPagamentoResponsavel(data, canonico, cooperativaId),
  ]);
  let total = 0;
  for (const mes of meses) {
    for (const f of listarFichasPendentesPagamento(data, canonico, mes, cooperativaId)) {
      const bruto = Number(f.valorBruto);
      total += Number.isFinite(bruto) && bruto > 0 ? bruto : Math.max(0, Number(f.valorLiquido) || 0);
    }
  }
  return round2(total);
}

/** Mesma leitura M6/Início que o cooperado vê em «Total a receber» / PIX aguardando assinatura. */
function hbCreditCreditoBaseParidadeQuantoVouReceberReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return 0;

  const m6 = hbCreditValorAReceberAgregado(data, cooperadoId, cooperativaId);
  if (m6.aguardandoAssinatura && m6.valorRecibo > 0) return round2(m6.valorRecibo);

  const inicio = hbCreditInicioParaBase(data, cooperadoId, cooperativaId);
  if (inicio.aguardandoAssinatura && inicio.valorRecibo > 0) return round2(inicio.valorRecibo);

  const { getValorQuantoVouReceberMotorLegado } =
    require("@/services/cooperadoEntregasService") as typeof import("@/services/cooperadoEntregasService");
  const legado = getValorQuantoVouReceberMotorLegado(data, cooperadoId, coopId);
  if (legado.valor > 0) return round2(legado.valor);
  if (inicio.exibir && inicio.valor > 0) return round2(inicio.valor);

  return 0;
}

/**
 * Crédito-base HB (limite/teto) — valor bruto da ficha nos meses em aberto.
 * Após quitação/liquidação do «A receber», base = 0 até nova entrega gerar pendência.
 */
export function hbCreditCreditoBaseReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const bruto = hbCreditCreditoBaseBrutoFichaAbertoReais(data, cooperadoId, cooperativaId);
  if (bruto > 0) return bruto;

  if (!coopId) return 0;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  if (!hbCreditMesesFinanceirosAbertos(data, canonico, coopId).length) {
    const m6 = hbCreditValorAReceberAgregado(data, cooperadoId, cooperativaId);
    if (m6.aguardandoAssinatura) {
      const titularIds = new Set(listCooperadoIdsMesmoTitular(data, canonico, coopId));
      const pixAguardando = (data.pagamentosCooperado ?? []).some((p) => {
        if (p.status !== "aguardando_confirmacao") return false;
        const pgCanonico = resolverCooperadoIdCanonico(data, p.cooperadoId, coopId);
        return titularIds.has(pgCanonico) || p.cooperadoId === canonico;
      });
      if (pixAguardando) {
        if (m6.valorRecibo > 0) return round2(m6.valorRecibo);
        const inicio = hbCreditInicioParaBase(data, cooperadoId, cooperativaId);
        if (inicio.valorRecibo > 0) return round2(inicio.valorRecibo);
      }
      if (m6.valor > 0) return round2(m6.valor);
      return 0;
    }
    if (m6.valor > 0) {
      const pendentesQvr = hbCreditMesesPendentesQuantoVouReceber(data, canonico, coopId);
      if (pendentesQvr.length) return round2(m6.valor);
    }
    return 0;
  }

  const pendente = hbCreditCreditoBaseBrutoFichasPendentesReais(data, cooperadoId, coopId);
  if (pendente > 0) return pendente;

  const paridade = hbCreditCreditoBaseParidadeQuantoVouReceberReais(data, cooperadoId, cooperativaId);
  return paridade > 0 ? paridade : 0;
}
