import type { AppData } from "@/types";
import { getDataRevision } from "@/services/dataStore";
import { reaisToCents } from "../shared/money";
import {
  blindarCreditoBaseCentsHb,
  prepararAppDataParaCreditoBaseHb,
} from "./creditBaseHbGuard";
import { hbCreditCreditoBaseReais } from "@/lib/hb-credit/hbCreditLeituraBic";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

function cnpjParaCreditoBase(data: AppData, cooperativaId?: string): string | undefined {
  if (cooperativaId) {
    const coop = data.cooperativas.find((c) => c.id === cooperativaId);
    if (coop?.cnpj) {
      const d = normalizeCnpj(coop.cnpj);
      if (d.length === 14) return d;
    }
  }
  const d = data.cooperativas
    .map((c) => normalizeCnpj(c.cnpj ?? ""))
    .find((x) => x.length === 14);
  return d;
}

function prepararCreditoBase(data: AppData, cooperativaId?: string): AppData {
  return prepararAppDataParaCreditoBaseHb(data, cnpjParaCreditoBase(data, cooperativaId));
}

/** Crédito base HB — valor bruto da ficha em meses em aberto; blindagem anti-fantasma separada. */
export function getCreditoBaseContaCoopReais(
  data: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const sane = prepararCreditoBase(data, cooperativaId);
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
    prepararCreditoBase(data, cooperativaId),
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
  const sane = prepararCreditoBase(data, cooperativaId);
  const map: Record<string, number> = {};
  for (const id of cooperadoIds) {
    map[id] = creditoBaseCentsForCooperado(sane, id, cooperativaId);
  }
  return map;
}

type CreditosBaseCache = {
  revision: number;
  coopId: string;
  idsKey: string;
  map: Record<string, number>;
};

let creditosBaseCache: CreditosBaseCache | null = null;

function cooperadoIdsCacheKey(ids: string[]): string {
  if (ids.length <= 1) return String(ids.length) + ids[0];
  return `${ids.length}:${ids.join("\u001f")}`;
}

/** Mesma regra de buildCreditosBaseMap, reutilizado entre revisões iguais do AppData. */
export function buildCreditosBaseMapCached(
  data: AppData,
  cooperadoIds: string[],
  cooperativaId?: string
): Record<string, number> {
  const revision = getDataRevision();
  const coopId = cooperativaId ?? "";
  const idsKey = cooperadoIdsCacheKey(cooperadoIds);
  if (
    creditosBaseCache &&
    creditosBaseCache.revision === revision &&
    creditosBaseCache.coopId === coopId &&
    creditosBaseCache.idsKey === idsKey
  ) {
    return creditosBaseCache.map;
  }
  const map = buildCreditosBaseMap(data, cooperadoIds, cooperativaId);
  creditosBaseCache = { revision, coopId, idsKey, map };
  return map;
}

const DEFAULT_CREDITOS_BASE_BATCH_SIZE = 6;

function yieldCreditosBaseMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function creditoBaseCentsForCooperado(
  sane: AppData,
  cooperadoId: string,
  cooperativaId?: string
): number {
  const coopId = cooperativaId ?? sane.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
  const canonico = resolverCooperadoIdCanonico(sane, cooperadoId, coopId);
  const reais = hbCreditCreditoBaseReais(sane, canonico, coopId);
  return blindarCreditoBaseCentsHb(sane, cooperadoId, coopId, reaisToCents(reais), sane);
}

/** Mesma regra que buildCreditosBaseMapCached, em lotes para não travar a UI. */
export async function buildCreditosBaseMapCachedAsync(
  data: AppData,
  cooperadoIds: string[],
  cooperativaId?: string,
  opts?: {
    batchSize?: number;
    onBatch?: (mapSoFar: Record<string, number>, done: number, total: number) => void;
    shouldContinue?: () => boolean;
  }
): Promise<Record<string, number>> {
  const revision = getDataRevision();
  const coopId = cooperativaId ?? "";
  const idsKey = cooperadoIdsCacheKey(cooperadoIds);
  if (
    creditosBaseCache &&
    creditosBaseCache.revision === revision &&
    creditosBaseCache.coopId === coopId &&
    creditosBaseCache.idsKey === idsKey
  ) {
    opts?.onBatch?.(creditosBaseCache.map, cooperadoIds.length, cooperadoIds.length);
    return creditosBaseCache.map;
  }

  const sane = prepararCreditoBase(data, cooperativaId);
  const map: Record<string, number> = {};
  const batchSize = Math.max(1, opts?.batchSize ?? DEFAULT_CREDITOS_BASE_BATCH_SIZE);
  const total = cooperadoIds.length;

  for (let i = 0; i < total; i += batchSize) {
    if (opts?.shouldContinue && !opts.shouldContinue()) {
      break;
    }
    const end = Math.min(i + batchSize, total);
    for (let j = i; j < end; j++) {
      const id = cooperadoIds[j];
      map[id] = creditoBaseCentsForCooperado(sane, id, cooperativaId);
    }
    opts?.onBatch?.({ ...map }, end, total);
    if (end < total) {
      await yieldCreditosBaseMainThread();
    }
  }

  if (!opts?.shouldContinue || opts.shouldContinue()) {
    creditosBaseCache = { revision, coopId, idsKey, map: { ...map } };
  }
  return map;
}

/** Invalida cache (testes). */
export function resetCreditosBaseMapCache(): void {
  creditosBaseCache = null;
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
