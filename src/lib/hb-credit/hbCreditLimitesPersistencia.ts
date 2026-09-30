/**
 * Cache local — lista de limites HB (responsável).
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export const HB_CREDIT_LIMITES_STORAGE_VERSION = 2;

export type HbCreditLimitesPersistido = {
  v: number;
  limites: ContaCoopLimiteCooperado[];
  creditosBaseCents?: Record<string, number>;
  savedAt: string;
};

export function hbCreditLimitesStorageKey(cnpj: string): string {
  return `hb.coop.hbCreditLimites.v${HB_CREDIT_LIMITES_STORAGE_VERSION}:${cnpj}`;
}

export function lerHbCreditLimitesPersistidos(cnpj: string): HbCreditLimitesPersistido | null {
  if (typeof localStorage === "undefined" || !cnpj) return null;
  try {
    const raw = localStorage.getItem(hbCreditLimitesStorageKey(cnpj));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HbCreditLimitesPersistido;
    if (
      parsed.v !== HB_CREDIT_LIMITES_STORAGE_VERSION &&
      parsed.v !== 1
    ) {
      return null;
    }
    if (!Array.isArray(parsed.limites)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarHbCreditLimitesPersistidos(
  cnpj: string,
  limites: ContaCoopLimiteCooperado[],
  creditosBaseCents?: Record<string, number>
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: HbCreditLimitesPersistido = {
      v: HB_CREDIT_LIMITES_STORAGE_VERSION,
      limites,
      creditosBaseCents:
        creditosBaseCents && Object.keys(creditosBaseCents).length ? creditosBaseCents : undefined,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(hbCreditLimitesStorageKey(cnpj), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
