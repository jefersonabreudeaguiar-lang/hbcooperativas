/**
 * Crédito-base HB sem ciclo de import.
 * creditBaseFromFicha / liberação não podem carregar hbCreditLeituraBic
 * (esse módulo puxa BIC + entregas e deixa o export indefinido no client).
 */
import type { AppData } from "@/types";
import {
  listCooperadoIdsMesmoTitular,
  resolverCooperadoIdCanonico,
} from "@/services/cooperadoCloudService";
import {
  getMesesReferenciaPagamento,
  getPagamentoConfirmadoCooperadoMes,
  getResumoPagamentoCooperado,
  listarFichasPendentesPagamento,
} from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";

const HB_CREDIT_APRESENTACAO: { apresentacaoConsolidada: true } = { apresentacaoConsolidada: true };

type EntregasMod = typeof import("@/services/cooperadoEntregasService");
type PortaMod = typeof import("@/lib/bic/bicLeituraPorta");
type BicMod = typeof import("@/services/bicLeituraCentralCooperado");

function loadEntregas(): EntregasMod {
  return require("@/services/cooperadoEntregasService") as EntregasMod;
}

function loadPorta(): PortaMod {
  return require("@/lib/bic/bicLeituraPorta") as PortaMod;
}

function loadBic(): BicMod {
  return require("@/services/bicLeituraCentralCooperado") as BicMod;
}

function mesesEmAberto(data: AppData, cooperadoId: string, cooperativaId: string): string[] {
  const fn = loadEntregas().listarMesesEmAbertoPagamentoResponsavel;
  if (typeof fn === "function") return fn(data, cooperadoId, cooperativaId);
  return [];
}

function mesesParidadeResumo(data: AppData, cooperadoId: string, cooperativaId: string): string[] {
  const fn = loadEntregas().listarMesesReferenciaResumoFinanceiroParidade;
  if (typeof fn === "function") return fn(data, cooperadoId, cooperativaId);
  return [];
}

function mesesPendentesQuantoVouReceber(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string[] {
  const bicListar = loadBic().bicCentralListarMesesPendentesQuantoVouReceber;
  if (typeof bicListar === "function") {
    const meses = bicListar(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (Array.isArray(meses)) return meses;
  }
  const fn = loadEntregas().listarMesesPendentesQuantoVouReceber;
  if (typeof fn === "function") return fn(data, cooperadoId, cooperativaId);
  return [];
}

function mesLiquidadoCaixa(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): boolean {
  const fn = loadEntregas().cooperadoMesLiquidadoPorPagamentoNoLivroCaixa;
  return typeof fn === "function" ? fn(data, cooperadoId, mesReferencia, cooperativaId) : false;
}

function mesQuitado(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): boolean {
  const fn = loadEntregas().cooperadoMesQuitado;
  return typeof fn === "function" ? fn(data, cooperadoId, mesReferencia, cooperativaId) : false;
}

function mesHbAindaAbertoLastro(
  data: AppData,
  cooperadoId: string,
  mesReferencia: string,
  cooperativaId: string
): boolean {
  if ((data.fechamentos ?? []).some((f) => f.mesReferencia === mesReferencia && f.bloqueado)) {
    return false;
  }
  if (mesLiquidadoCaixa(data, cooperadoId, mesReferencia, cooperativaId)) return false;
  if (
    mesQuitado(data, cooperadoId, mesReferencia, cooperativaId) &&
    getPagamentoConfirmadoCooperadoMes(data, cooperadoId, mesReferencia)
  ) {
    return false;
  }
  return true;
}

function hbCreditMesesFinanceirosAbertos(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): string[] {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = new Set<string>([
    ...mesesEmAberto(data, canonico, cooperativaId),
    ...mesesParidadeResumo(data, canonico, cooperativaId),
    ...mesesPendentesQuantoVouReceber(data, canonico, cooperativaId),
  ]);

  const porta = loadPorta().resolveLeituraFinanceiraCooperadoCore;
  if (typeof porta === "function") {
    const paridade = porta(data, canonico, cooperativaId);
    for (const mes of paridade.mesesResumo ?? []) {
      if (mes?.trim()) meses.add(mes);
    }
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

function brutoFichaAbertoReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): number {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = hbCreditMesesFinanceirosAbertos(data, canonico, cooperativaId);
  let total = 0;
  for (const mes of meses) {
    if (!mesHbAindaAbertoLastro(data, canonico, mes, cooperativaId)) continue;
    const resumo = getResumoPagamentoCooperado(data, canonico, mes, cooperativaId);
    if (resumo.valorBruto > 0) total += resumo.valorBruto;
  }
  return round2(total);
}

function brutoFichasPendentesReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): number {
  const canonico = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const meses = hbCreditMesesFinanceirosAbertos(data, canonico, cooperativaId);
  let total = 0;
  for (const mes of meses) {
    for (const f of listarFichasPendentesPagamento(data, canonico, mes, cooperativaId)) {
      const bruto = Number(f.valorBruto);
      total += Number.isFinite(bruto) && bruto > 0 ? bruto : Math.max(0, Number(f.valorLiquido) || 0);
    }
  }
  return round2(total);
}

function paridadeQuantoVouReceberReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  if (!coopId) return 0;

  const porta = loadPorta().resolveLeituraFinanceiraCooperadoCore;
  if (typeof porta === "function") {
    const paridade = porta(data, cooperadoId, coopId);
    if (paridade.valorLiquido > 0.005) return round2(paridade.valorLiquido);
  }

  const bic = loadBic();
  const m6Fn = bic.bicCentralValorAReceberAgregado;
  if (typeof m6Fn === "function") {
    const m6 = m6Fn(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (m6.aguardandoAssinatura && m6.valorRecibo > 0) return round2(m6.valorRecibo);
    if (m6.valor > 0) return round2(m6.valor);
  }

  const inicioFn = bic.bicCentralResolveInicioParaExibicao;
  if (typeof inicioFn === "function") {
    const inicio = inicioFn(data, cooperadoId, cooperativaId, HB_CREDIT_APRESENTACAO);
    if (inicio.aguardandoAssinatura && inicio.valorRecibo > 0) return round2(inicio.valorRecibo);
    if (inicio.exibir && inicio.valor > 0) return round2(inicio.valor);
  }

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

  const paridade = paridadeQuantoVouReceberReais(data, cooperadoId, cooperativaId);
  if (paridade > 0) return paridade;

  const bruto = brutoFichaAbertoReais(data, cooperadoId, coopId);
  if (bruto > 0) return bruto;

  const pendente = brutoFichasPendentesReais(data, cooperadoId, coopId);
  if (pendente > 0) return pendente;

  return 0;
}
