import type { AppData } from "@/types";
import { getTotalAPagarCooperado } from "@/services/notaPedidoService";
import { reaisToCents } from "../shared/money";

/** Crédito base do cooperado = total pendente na ficha (Quanto vou receber). */
export function getCreditoBaseCooperadoCents(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const reais = getTotalAPagarCooperado(data, cooperadoId, undefined, cooperativaId);
  return reaisToCents(Math.max(0, reais));
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
