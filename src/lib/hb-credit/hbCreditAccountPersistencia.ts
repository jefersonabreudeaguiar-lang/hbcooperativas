/**
 * Cache local da conta HB Créditos (cooperado) — abertura instantânea da aba.
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export const HB_CREDIT_ACCOUNT_STORAGE_VERSION = 4;

export type HbCreditAccountPersistido = {
  v: number;
  account: ContaCoopLimiteCooperado | null;
  updatedAt: string | null;
  hasPin: boolean;
  pinResetPending: boolean;
  savedAt: string;
};

export function hbCreditAccountStorageKey(cnpj: string, cooperadoId: string): string {
  return `hb.coop.hbCreditAccount.v${HB_CREDIT_ACCOUNT_STORAGE_VERSION}:${cnpj}:${cooperadoId}`;
}

export function lerHbCreditAccountPersistido(
  cnpj: string,
  cooperadoId: string
): HbCreditAccountPersistido | null {
  if (typeof localStorage === "undefined" || !cnpj || !cooperadoId) return null;
  try {
    const raw = localStorage.getItem(hbCreditAccountStorageKey(cnpj, cooperadoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HbCreditAccountPersistido;
    if (parsed.v !== HB_CREDIT_ACCOUNT_STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function lerHbCreditAccountPersistidoFlex(
  cooperadoId: string,
  cnpj?: string
): HbCreditAccountPersistido | null {
  if (cnpj) {
    const direct = lerHbCreditAccountPersistido(cnpj, cooperadoId);
    if (direct) return direct;
  }
  if (typeof localStorage === "undefined") return null;
  const prefix = `hb.coop.hbCreditAccount.v${HB_CREDIT_ACCOUNT_STORAGE_VERSION}:`;
  const suffix = `:${cooperadoId}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as HbCreditAccountPersistido;
      if (parsed.v === HB_CREDIT_ACCOUNT_STORAGE_VERSION) return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function gravarHbCreditAccountPersistido(
  cnpj: string,
  cooperadoId: string,
  payload: HbCreditAccountPersistido
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(hbCreditAccountStorageKey(cnpj, cooperadoId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function aplicarHbCreditAccountPersistido(
  snap: HbCreditAccountPersistido
): {
  account: ContaCoopLimiteCooperado | null;
  updatedAt: string | null;
  hasPin: boolean;
  pinResetPending: boolean;
} {
  return {
    account: snap.account,
    updatedAt: snap.updatedAt,
    hasPin: snap.hasPin,
    pinResetPending: snap.pinResetPending,
  };
}
