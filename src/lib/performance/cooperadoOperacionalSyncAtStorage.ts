/** Timestamp do último sync operacional cooperado — módulo folha (sem importar fichaSyncGuard/coldStart). */

export const COOPERADO_LAST_OPERACIONAL_SYNC_AT_KEY = "hb-coop-operacional-last-sync-at";

export function readCooperadoLastOperacionalSyncAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(COOPERADO_LAST_OPERACIONAL_SYNC_AT_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function persistCooperadoLastOperacionalSyncAt(at = Date.now()): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOPERADO_LAST_OPERACIONAL_SYNC_AT_KEY, String(at));
}
