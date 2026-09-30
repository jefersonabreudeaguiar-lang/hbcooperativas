/** Limite HB sincronizado na nuvem (mesmo aparelho: evento; outro aparelho: poll revision no cooperado). */
export const HB_CREDIT_LIMITE_SYNCED_EVENT = "hb-credit-limite-synced";

const NOTIFY_MIN_INTERVAL_MS = 12_000;
let lastNotifyAt = 0;

export function notifyHbCreditLimiteSynced(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastNotifyAt < NOTIFY_MIN_INTERVAL_MS) return;
  lastNotifyAt = now;
  window.dispatchEvent(new Event(HB_CREDIT_LIMITE_SYNCED_EVENT));
}
