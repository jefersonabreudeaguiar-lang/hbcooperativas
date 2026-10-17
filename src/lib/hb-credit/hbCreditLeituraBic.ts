/**
 * HB Créditos — leitura financeira alinhada ao hub BIC (mesma projeção cooperado/responsável).
 * Somente leitura; não altera ledger HB nem AppData.
 */
import type { AppData } from "@/types";
import {
  cooperadoMesQuitado,
  cooperadoMesLiquidadoPorPagamentoNoLivroCaixa,
  getMesPrincipalQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
  listarMesesEmAbertoPagamentoResponsavel,
  listarMesesReferenciaResumoFinanceiroParidade,
} from "@/services/cooperadoEntregasService";
import { listarFichasPendentesPagamento } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import {
  listCooperadoIdsMesmoTitular,
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import { resolveLeituraFinanceiraCooperadoCore } from "@/lib/bic/bicLeituraPorta";
import {
  getMesesReferenciaPagamento,
  getPagamentoConfirmadoCooperadoMes,
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
} from "@/services/notaPedidoService";

const HB_CREDIT_APRESENTACAO: { apresentacaoConsolidada: true } = { apresentacaoConsolidada: true };

type BicLeituraCentralModule = typeof import("@/services/bicLeituraCentralCooperado");

/** Evita spread de export ainda indefinido (ciclo creditBaseFromFicha ↔ BIC no client). */
function loadBicLeituraCentralCooperado(): BicLeituraCentralModule {
  return require("@/services/bicLeituraCentralCooperado") as BicLeituraCentralModule;
}

function bicCentralValorAReceberAgregadoLazy(
  ...args: Parameters<BicLeituraCentralModule["bicCentralValorAReceberAgregado"]>
): ReturnType<BicLeituraCentralModule["bicCentralValorAReceberAgregado"]> {
  const fn = loadBicLeituraCentralCooperado().bicCentralValorAReceberAgregado;
  if (typeof fn !== "function") {
    throw new Error("bicCentralValorAReceberAgregado indisponível (módulo BIC ainda carregando)");
  }
  return fn(...args);
}

function bicCentralResolveInicioParaExibicaoLazy(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined,
  opts?: { apresentacaoConsolidada?: boolean }
) {
  const fn = loadBicLeituraCentralCooperado().bicCentralResolveInicioParaExibicao;
  if (typeof fn !== "function") {
    throw new Error("bicCentralResolveInicioParaExibicao indisponível (módulo BIC ainda carregando)");
  }
  return fn(data, cooperadoId, cooperativaId, opts);
}

/** Evita spread de export ainda indefinido (ciclo creditBaseFromFicha ↔ BIC no client). */
function hbCreditMesesPendentesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string[] {
  const bicListar = loadBicLeituraCentralCooperado().bicCentralListarMesesPendentesQuantoVouReceber;
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
  const bicMes = loadBicLeituraCentralCooperado().bicCentralMesPrincipalQuantoVouReceber;
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
  return bicCentralResolveInicioParaExibicaoLazy(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
}

/** M6 agregado BIC — referência cruzada responsável × cooperado. */
export function hbCreditValorAReceberAgregado(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
) {
  return bicCentralValorAReceberAgregadoLazy(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
}

/** Mês ainda lastreia HB — não liquidado no caixa e sem fechamento bloqueado. */
function mesHbAindaAbertoLastro(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): boolean {
  if ((data.fechamentos ?? []).some((f) => f.mesReferencia === mesReferencia && f.bloqueado)) {
    return false;
  }
  if (cooperadoMesLiquidadoPorPagamentoNoLivroCaixa(data, cooperadoId, mesReferencia, cooperativaId)) {
    return false;
  }
  if (
    cooperadoMesQuitado(data, cooperadoId, mesReferencia, cooperativaId) &&
    getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia)
  ) {
    return false;
  }
  return true;
}

/**
 * Mesma janela do «A receber» do cooperado: ficha em aberto + paridade BIC + PIX aguardando.
 * Mês com PIX confirmado e débito no caixa não entra.
 */
function hbCreditMesesFinanceirosAbertos(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = new Set<string>([
    ...listarMesesEmAbertoPagamentoResponsavel(data, canonico, cooperativaId),
    ...listarMesesReferenciaResumoFinanceiroParidade(data, canonico, cooperativaId),
    ...hbCreditMesesPendentesQuantoVouReceber(data, canonico, cooperativaId),
  ]);
  const paridade = resolveLeituraFinanceiraCooperadoCore(data, canonico, cooperativaId);
  for (const mes of paridade.mesesResumo ?? []) {
    if (mes?.trim()) meses.add(mes);
  }

  const titularIds = new Set(listCooperadoIdsMesmoTitular(data, canonico, cooperativaId));
  for (const p of data.pagamentosCooperado ?? []) {
    if (p.status !== "aguardando_confirmacao") continue;
    const pgCanonico = resolverCooperadoIdCanonico(data, p.cooperadoId, cooperativaId);
    if (!titularIds.has(pgCanonico) && p.cooperadoId !== canonico) continue;
    for (const mes of getMesesReferenciaPagamento(p)) {
      if (mes?.trim()) meses.add(mes);
    }
  }

  return [...meses]
    .filter((mes) => mesHbAindaAbertoLastro(data, canonico, mes, cooperativaId))
    .sort();
}

/** Meses lastro HB = A receber do cooperado, sem reabrir mês já liquidado no caixa. */
export function hbCreditMesesReferenciaUnificados(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  _mesFallback?: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  return hbCreditMesesFinanceirosAbertos(data, canonico, cooperativaId);
}

/** Mês principal BIC (consolidado) — fallback cooperado/responsável. */
export function hbCreditMesPrincipal(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string {
  const paridade = resolveLeituraFinanceiraCooperadoCore(data, cooperadoId, cooperativaId);
  const meses = paridade.mesesResumo;
  if (meses.length) return meses[meses.length - 1]!;
  const bicMes = loadBicLeituraCentralCooperado().bicCentralMesPrincipalQuantoVouReceber;
  if (typeof bicMes === "function") {
    const mes = bicMes(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (mes?.trim()) return mes;
  }
  return hbCreditMesPrincipalFallback(data, cooperadoId, cooperativaId);
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
  if (!mesHbAindaAbertoLastro(data, cooperadoId, mesReferencia, cooperativaId)) return false;
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
  const meses = hbCreditMesesReferenciaUnificados(data, canonico, cooperativaId);
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

  const paridade = resolveLeituraFinanceiraCooperadoCore(data, cooperadoId, coopId);
  if (paridade.valorLiquido > 0.005) return round2(paridade.valorLiquido);

  const m6 = hbCreditValorAReceberAgregado(data, cooperadoId, cooperativaId);
  if (m6.aguardandoAssinatura && m6.valorRecibo > 0) return round2(m6.valorRecibo);

  const inicio = hbCreditInicioParaBase(data, cooperadoId, cooperativaId);
  if (inicio.aguardandoAssinatura && inicio.valorRecibo > 0) return round2(inicio.valorRecibo);

  if (m6.valor > 0) return round2(m6.valor);
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
  if (!coopId) return 0;
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const mesesLastro = hbCreditMesesFinanceirosAbertos(data, canonico, coopId);
  if (!mesesLastro.length) return 0;

  const paridade = hbCreditCreditoBaseParidadeQuantoVouReceberReais(data, cooperadoId, cooperativaId);
  if (paridade > 0) return paridade;

  const bruto = hbCreditCreditoBaseBrutoFichaAbertoReais(data, cooperadoId, cooperativaId);
  if (bruto > 0) return bruto;

  const pendente = hbCreditCreditoBaseBrutoFichasPendentesReais(data, cooperadoId, coopId);
  if (pendente > 0) return pendente;

  return 0;
}
