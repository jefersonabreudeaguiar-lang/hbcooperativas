import type { AppData } from "@/types";
import { fichaPertenceCooperado, resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  fichaValidaNoExtrato,
  getResumoPagamentoCooperado,
  listarFichasExtratoCooperadoMes,
} from "@/services/notaPedidoService";
import { round2 } from "@/utils/calculations";
import { reaisToCents } from "../shared/money";

/**
 * Crédito base Conta Coop:
 * — somente meses com ficha pendente de pagamento ao cooperado;
 * — base = valor das entregas (sincronizado com a ficha);
 * — zera após liquidação do cooperado ou do mercado; novas entregas reconstruem a base.
 */
export function getCreditoBaseContaCoopReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const cooperadoCanonico = resolverCooperadoIdCanonico(data, cooperadoId, coopId);

  const meses = [
    ...new Set(
      data.fichaCorrida
        .filter(
          (f) =>
            fichaPertenceCooperado(data, f, cooperadoCanonico, coopId) &&
            fichaValidaNoExtrato(data, f)
        )
        .map((f) => f.mesReferencia)
    ),
  ].sort();

  let total = 0;
  for (const mes of meses) {
    const fichas = listarFichasExtratoCooperadoMes(data, cooperadoCanonico, mes, coopId);
    if (!fichas.length || !fichas.some((f) => f.status === "pendente")) continue;

    total += getResumoPagamentoCooperado(data, cooperadoCanonico, mes, coopId).valorEntregas;
  }

  return round2(Math.max(0, total));
}

/** Crédito base do cooperado para limite Conta Coop (centavos). */
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
