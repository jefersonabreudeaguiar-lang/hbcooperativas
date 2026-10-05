const OFF = new Set(["false", "0", "no", "off"]);

/** RQL 8.5 — stats gestão (BIC agregado) em Web Worker. Default ligado no browser. */
export function isRqlAdminStatsWorkerEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const raw = process.env.NEXT_PUBLIC_RQL_ADMIN_STATS_WORKER;
  if (raw == null || raw.trim() === "") return true;
  return !OFF.has(raw.trim().toLowerCase());
}
