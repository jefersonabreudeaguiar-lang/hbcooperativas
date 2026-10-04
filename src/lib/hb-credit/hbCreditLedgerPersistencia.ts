/** Cache local do extrato HB — aba Extrato instantânea; atualiza em segundo plano. */
import type { ContaCoopLedgerEntry } from "@/modules/hb-credit/types";

const HB_CREDIT_LEDGER_STORAGE_VERSION = 1;

type HbCreditLedgerPersistido = {
  v: number;
  entries: ContaCoopLedgerEntry[];
  savedAt: string;
};

function storageKey(cnpj: string, cooperadoId: string): string {
  return `hb.coop.hbCreditLedger.v${HB_CREDIT_LEDGER_STORAGE_VERSION}:${cnpj}:${cooperadoId}`;
}

export function lerHbCreditLedgerPersistido(
  cnpj: string,
  cooperadoId: string
): ContaCoopLedgerEntry[] | null {
  if (typeof localStorage === "undefined" || !cnpj || !cooperadoId) return null;
  try {
    const raw = localStorage.getItem(storageKey(cnpj, cooperadoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HbCreditLedgerPersistido;
    if (parsed.v !== HB_CREDIT_LEDGER_STORAGE_VERSION || !Array.isArray(parsed.entries)) return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

export function gravarHbCreditLedgerPersistido(
  cnpj: string,
  cooperadoId: string,
  entries: ContaCoopLedgerEntry[]
): void {
  if (typeof localStorage === "undefined" || !cnpj || !cooperadoId) return;
  try {
    const payload: HbCreditLedgerPersistido = {
      v: HB_CREDIT_LEDGER_STORAGE_VERSION,
      entries,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(cnpj, cooperadoId), JSON.stringify(payload));
  } catch {
    /* quota / modo privado */
  }
}
