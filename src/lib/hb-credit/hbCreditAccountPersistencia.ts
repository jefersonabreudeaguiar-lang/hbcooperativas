/**
 * Cache local da conta HB Créditos (cooperado) — abertura instantânea da aba.
 */
import type { ContaCoopLimiteCooperado } from "@/modules/hb-credit/types";

export const HB_CREDIT_ACCOUNT_STORAGE_VERSION = 5;

/** Cache antigo com conta “zerada” sem PIN — não exibir; força refetch na nuvem. */
export function hbCreditAccountPersistidoEhShellVazio(snap: HbCreditAccountPersistido): boolean {
  const acc = snap.account;
  if (!acc) return true;
  const liberado = Math.max(0, acc.limiteLiberadoCents ?? 0);
  const disponivel = Math.max(0, acc.valorDisponivelCents ?? 0);
  const usado = Math.max(0, acc.valorUsadoCents ?? 0);
  if (liberado > 0 || disponivel > 0 || usado > 0) return false;
  return !snap.hasPin;
}

export type HbCreditAccountPersistido = {
  v: number;
  account: ContaCoopLimiteCooperado | null;
  updatedAt: string | null;
  hasPin: boolean;
  pinResetPending: boolean;
  savedAt: string;
};

// A leitura atual não depende da quota do navegador; mantém isolamento por CNPJ/conta.
const accountMemory = new Map<string, HbCreditAccountPersistido>();

export function hbCreditAccountStorageKey(cnpj: string, cooperadoId: string): string {
  return `hb.coop.hbCreditAccount.v${HB_CREDIT_ACCOUNT_STORAGE_VERSION}:${cnpj}:${cooperadoId}`;
}

export function lerHbCreditAccountPersistido(
  cnpj: string,
  cooperadoId: string
): HbCreditAccountPersistido | null {
  if (!cnpj || !cooperadoId) return null;
  const memory = accountMemory.get(hbCreditAccountStorageKey(cnpj, cooperadoId));
  if (memory) return hbCreditAccountPersistidoEhShellVazio(memory) ? null : memory;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(hbCreditAccountStorageKey(cnpj, cooperadoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HbCreditAccountPersistido;
    if (parsed.v !== HB_CREDIT_ACCOUNT_STORAGE_VERSION) return null;
    if (hbCreditAccountPersistidoEhShellVazio(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** CNPJ (14 dígitos) do último cache HB deste cooperado — útil antes do AppData aquecer. */
export function lerCnpjHbCreditPersistidoParaCooperado(cooperadoId: string): string {
  if (typeof localStorage === "undefined" || !cooperadoId.trim()) return "";
  const prefix = `hb.coop.hbCreditAccount.v${HB_CREDIT_ACCOUNT_STORAGE_VERSION}:`;
  const suffix = `:${cooperadoId.trim()}`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || !key.endsWith(suffix)) continue;
      const middle = key.slice(prefix.length, key.length - suffix.length);
      const digits = middle.replace(/\D/g, "");
      if (digits.length === 14) return digits;
    }
  } catch {
    return "";
  }
  return "";
}

export function lerHbCreditAccountPersistidoFlex(
  cooperadoId: string,
  cnpj?: string
): HbCreditAccountPersistido | null {
  if (cnpj) {
    // Nunca buscar saldo de outro CNPJ quando a cooperativa atual é conhecida.
    return lerHbCreditAccountPersistido(cnpj, cooperadoId);
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
      if (parsed.v === HB_CREDIT_ACCOUNT_STORAGE_VERSION && !hbCreditAccountPersistidoEhShellVazio(parsed)) {
        return parsed;
      }
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
  const key = hbCreditAccountStorageKey(cnpj, cooperadoId);
  accountMemory.delete(key);
  accountMemory.set(key, payload);
  while (accountMemory.size > 32) {
    const first = accountMemory.keys().next().value;
    if (!first) break;
    accountMemory.delete(first);
  }
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    accountMemory.delete(key);
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
