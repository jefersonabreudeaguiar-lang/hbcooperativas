/** Trace opcional no celular: localStorage `hb.coop.mobile.trace` = `1` */
const KEY = "hb.coop.mobile.trace";
const RING_KEY = "hb.coop.mobile.trace.ring";
const MAX = 40;

export function cooperadoMobileSyncTrace(event: string, detail?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(KEY) !== "1") return;
  } catch {
    return;
  }
  const row = { t: Date.now(), event, detail: detail ?? null };
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    const ring: typeof row[] = raw ? (JSON.parse(raw) as typeof row[]) : [];
    ring.push(row);
    while (ring.length > MAX) ring.shift();
    sessionStorage.setItem(RING_KEY, JSON.stringify(ring));
  } catch {
    /* quota */
  }
}

export function readCooperadoMobileSyncTraceRing(): { t: number; event: string; detail: string | null }[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    return raw ? (JSON.parse(raw) as { t: number; event: string; detail: string | null }[]) : [];
  } catch {
    return [];
  }
}
