/** Nuvem HB mudou — telas devem refetch (cooperado, responsável, resumo). */
export const HB_CREDIT_LIMITE_SYNCED_EVENT = "hb-credit-limite-synced";

/** localStorage da conta HB atualizado — UI que só lê cache (ex.: card na home). */
export const HB_CREDIT_ACCOUNT_CACHE_EVENT = "hb-credit-account-cache";

const NOTIFY_DEBOUNCE_MS = 280;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

export type NotifyHbCreditLimiteOpts = {
  /** Pagamento/liberação: dispara já, sem esperar debounce. */
  immediate?: boolean;
};

export function notifyHbCreditAccountCacheUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HB_CREDIT_ACCOUNT_CACHE_EVENT));
}

function dispatchLimiteSynced(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(HB_CREDIT_LIMITE_SYNCED_EVENT));
}

export function notifyHbCreditLimiteSynced(opts?: NotifyHbCreditLimiteOpts): void {
  if (typeof window === "undefined") return;
  if (opts?.immediate) {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    dispatchLimiteSynced();
    return;
  }
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    dispatchLimiteSynced();
  }, NOTIFY_DEBOUNCE_MS);
}
