import type { AppData } from "@/types";
import { listarMesesPendentesQuantoVouReceber } from "@/services/cooperadoEntregasService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getResumoPagamentoExibicao } from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import { reaisToCents } from "../shared/money";

/**
 * Crédito base HB Créditos (alinhado ao app do cooperado):
 * — mesmos meses de listarMesesPendentesQuantoVouReceber;
 * — base = valor líquido a receber (resumo da ficha: entregas − mensalidade − HB − avulsos + créditos);
 * — zera após liquidação; novas entregas reconstruem a base.
 */
export function getCreditoBaseContaCoopReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  const meses = listarMesesPendentesQuantoVouReceber(data, cooperadoCanonico, coopId);
  if (!meses.length) return 0;

  let total = 0;
  for (const mes of meses) {
    total += getResumoPagamentoExibicao(data, cooperadoCanonico, mes, coopId).valorLiquido;
  }

  return round2(Math.max(0, total));
}

/** Crédito base do cooperado para limite HB Créditos (centavos). */
export function getCreditoBaseCooperadoCents(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  return reaisToCents(getCreditoBaseContaCoopReais(data, cooperadoId, cooperativaId));
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
