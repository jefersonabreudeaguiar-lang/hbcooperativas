import type { AppData } from "@/types";
import {
  cooperadoExibirValorReceberInicio,
  cooperadoMesQuitado,
  listarMesesComValorQuantoVouReceber,
} from "@/services/cooperadoEntregasService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  getResumoValorAPagarRelatorio,
  listarFichasPendentesPagamento,
} from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import { reaisToCents } from "../shared/money";
import {
  blindarCreditoBaseCentsHb,
  prepararAppDataParaCreditoBaseHb,
} from "./creditBaseHbGuard";

/**
 * Crédito base HB = o que o cooperado vê em “A receber”, com fichas pendentes válidas por mês.
 * Exclui meses quitados, PIX aguardando assinatura e meses só com resumo fantasma (sem ficha pendente).
 */
export function getCreditoBaseContaCoopReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const sane = prepararAppDataParaCreditoBaseHb(data);
  const coopId = cooperativaId ?? sane.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(sane, cooperadoId, coopId);

  const inicio = cooperadoExibirValorReceberInicio(sane, cooperadoCanonico, coopId);
  if (!inicio.exibir || inicio.aguardandoAssinatura || inicio.valor <= 0) return 0;

  const meses = listarMesesComValorQuantoVouReceber(sane, cooperadoCanonico, coopId);
  if (!meses.length) return 0;

  let total = 0;
  for (const mes of meses) {
    if (cooperadoMesQuitado(sane, cooperadoCanonico, mes)) continue;
    if (!listarFichasPendentesPagamento(sane, cooperadoCanonico, mes, coopId).length) continue;
    const valorMes = getResumoValorAPagarRelatorio(sane, cooperadoCanonico, mes, coopId).valorLiquido;
    if (valorMes <= 0) continue;
    total += valorMes;
  }

  if (total <= 0) return 0;
  return round2(Math.max(0, Math.min(inicio.valor, total)));
}

/** Crédito base do cooperado para limite HB Créditos (centavos). */
export function getCreditoBaseCooperadoCents(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const reais = getCreditoBaseContaCoopReais(data, cooperadoId, cooperativaId);
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  return blindarCreditoBaseCentsHb(
    prepararAppDataParaCreditoBaseHb(data),
    cooperadoId,
    coopId,
    reaisToCents(reais)
  );
}

export function buildCreditosBaseMap(
  data: AppData,
  cooperadoIds: string[],
  cooperativaId?: string
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const id of cooperadoIds) {
    map[id] = getCreditoBaseCooperadoCents(data, id, cooperativaId);
  }
  return map;
}

export function calcLimiteFromPercentual(creditoBaseCents: number, percentual: number): number {
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw new Error("Percentual inválido (use 0 a 100).");
  }
  return Math.round(Math.max(0, creditoBaseCents) * (percentual / 100));
}

export function sumCreditosBaseCents(creditosBaseCents: Record<string, number>): number {
  return Object.values(creditosBaseCents).reduce(
    (total, value) => total + Math.max(0, Math.round(Number(value) || 0)),
    0
  );
}

/** Teto global em centavos = soma do percentual aplicado a cada cooperado (mesma regra da liberação coletiva). */
export function calcTetoGlobalCents(
  creditosBaseCents: Record<string, number>,
  tetoPercent: number
): number {
  if (!Number.isFinite(tetoPercent) || tetoPercent <= 0 || tetoPercent > 100) {
    throw new Error("Configuração de teto percentual inválida ou ausente.");
  }
  let total = 0;
  for (const value of Object.values(creditosBaseCents)) {
    const base = Math.max(0, Math.round(Number(value) || 0));
    total += calcLimiteFromPercentual(base, tetoPercent);
  }
  return total;
}
