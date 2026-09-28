import type { AppData } from "@/types";
import { reaisToCents } from "../shared/money";
import {
  blindarCreditoBaseCentsHb,
  prepararAppDataParaCreditoBaseHb,
} from "./creditBaseHbGuard";
import { hbCreditCreditoBaseReais } from "@/lib/hb-credit/hbCreditLeituraBic";

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
  return hbCreditCreditoBaseReais(sane, cooperadoId, coopId);
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
