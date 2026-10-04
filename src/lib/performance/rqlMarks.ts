/**
 * HX 8.0 — marcas de performance (browser). Read-only no servidor.
 */

export type RqlRouteHop = "dashboard" | "notas-pedido" | "minha-conta-coop" | string;

const ROUTE_MARK_PREFIX = "rql:route:";

export function markRqlRouteTransition(from: RqlRouteHop, to: RqlRouteHop): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  const name = `${ROUTE_MARK_PREFIX}${from}->${to}`;
  try {
    performance.mark(name);
  } catch {
    /* quota / duplicate */
  }
}

export function markRqlDataRevision(revision: number): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`rql:data-revision:${revision}`);
  } catch {
    /* ignore */
  }
}

/** Lê duração entre duas marcas (ms) — null se indisponível. */
export function measureRqlMark(start: string, end: string): number | null {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return null;
  try {
    performance.measure(`${start}..${end}`, start, end);
    const entries = performance.getEntriesByName(`${start}..${end}`);
    const last = entries[entries.length - 1];
    return last?.duration ?? null;
  } catch {
    return null;
  }
}

export function listRqlRouteMarks(): string[] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  return performance
    .getEntriesByType("mark")
    .map((e) => e.name)
    .filter((n) => n.startsWith(ROUTE_MARK_PREFIX));
}

const COLD_START_PREFIX = "rql:cold:";

/** HX 9.0 — fases da abertura cooperado (diagnóstico read-only). */
export function markRqlColdStartPhase(phase: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`${COLD_START_PREFIX}${phase}`);
  } catch {
    /* ignore */
  }
}
