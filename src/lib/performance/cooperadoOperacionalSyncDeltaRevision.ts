/**
 * Fase 3 — base para sync delta por revision (cooperativa).
 * Hoje só registra a última revision materializada pós-sync cooperado.
 */

const KEY_PREFIX = "hb.coop.operacionalMaterializedRev.v1";

function storageKey(cooperativaId: string): string {
  return `${KEY_PREFIX}:${cooperativaId}`;
}

export function readCooperadoOperacionalMaterializedRevision(cooperativaId: string): number {
  if (typeof localStorage === "undefined" || !cooperativaId) return -1;
  try {
    const raw = localStorage.getItem(storageKey(cooperativaId));
    if (!raw) return -1;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : -1;
  } catch {
    return -1;
  }
}

export function recordCooperadoOperacionalMaterializedRevision(
  cooperativaId: string,
  appDataRevision: number
): void {
  if (typeof localStorage === "undefined" || !cooperativaId) return;
  try {
    localStorage.setItem(storageKey(cooperativaId), String(appDataRevision));
  } catch {
    /* quota */
  }
}
