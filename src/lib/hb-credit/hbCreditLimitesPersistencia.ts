/**
 * Cache local — lista de limites HB (responsável).
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export const HB_CREDIT_LIMITES_STORAGE_VERSION = 1;

export type HbCreditLimitesPersistido = {
  v: number;
  limites: ContaCoopLimiteCooperado[];
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
    if (parsed.v !== HB_CREDIT_LIMITES_STORAGE_VERSION || !Array.isArray(parsed.limites)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarHbCreditLimitesPersistidos(
  cnpj: string,
  limites: ContaCoopLimiteCooperado[]
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: HbCreditLimitesPersistido = {
      v: HB_CREDIT_LIMITES_STORAGE_VERSION,
      limites,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(hbCreditLimitesStorageKey(cnpj), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}
