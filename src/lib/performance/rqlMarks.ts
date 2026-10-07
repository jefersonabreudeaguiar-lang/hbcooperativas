/**
 * HX 8.0 — marcas de performance (browser). Read-only no servidor.
 */

export type RqlRouteHop = "dashboard" | "notas-pedido" | "minha-conta-coop" | string;

const ROUTE_MARK_PREFIX = "rql:route:";
const ROUTE_PAINT_PREFIX = "rql:route-paint:";

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

/** L1 proxy — primeiro frame pintado após troca de rota (double rAF). */
export function markRqlRoutePaintReady(hop: RqlRouteHop): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`${ROUTE_PAINT_PREFIX}${hop}`);
  } catch {
    /* ignore */
  }
}

export function scheduleMarkRqlRoutePaintReady(hop: RqlRouteHop): () => void {
  if (typeof requestAnimationFrame !== "function") return () => undefined;
  let inner = 0;
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(() => markRqlRoutePaintReady(hop));
  });
  return () => {
    cancelAnimationFrame(outer);
    if (inner) cancelAnimationFrame(inner);
  };
}

export type RqlRouteTimingRow = {
  transition: string;
  toHop: string;
  paintMs: number | null;
};

/** Diagnóstico homolog — pares transição → paint (ms desde navigation start do mark). */
export function summarizeRqlRouteTimings(): RqlRouteTimingRow[] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  const marks = performance.getEntriesByType("mark") as PerformanceMark[];
  const paintByHop = new Map<string, number>();
  for (const m of marks) {
    if (m.name.startsWith(ROUTE_PAINT_PREFIX)) {
      paintByHop.set(m.name.slice(ROUTE_PAINT_PREFIX.length), m.startTime);
    }
  }
  const rows: RqlRouteTimingRow[] = [];
  for (const m of marks) {
    if (!m.name.startsWith(ROUTE_MARK_PREFIX)) continue;
    const arrow = m.name.indexOf("->");
    if (arrow < 0) continue;
    const toHop = m.name.slice(arrow + 2);
    const paintStart = paintByHop.get(toHop);
    rows.push({
      transition: m.name.slice(ROUTE_MARK_PREFIX.length),
      toHop,
      paintMs: paintStart != null ? Math.round((paintStart - m.startTime) * 10) / 10 : null,
    });
  }
  return rows;
}

const INTERACTION_PREFIX = "rql:interaction:";
const STAFF_SUBVIEW_PREFIX = "rql:staff-notas:";

/** UX crítica (Conferir, Lançar foto) — só marcas, zero efeito em sync/dados. */
export function markRqlInteractionPhase(phase: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`${INTERACTION_PREFIX}${phase}`);
  } catch {
    /* ignore */
  }
}

/** Responsável em /notas-pedido — troca fila/histórico/cooperado (pathname não muda). */
export function markRqlStaffNotasSubviewTransition(from: string, to: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  if (!from || !to || from === to) return;
  try {
    performance.mark(`${STAFF_SUBVIEW_PREFIX}${from}->${to}`);
  } catch {
    /* ignore */
  }
}

export function listRqlInteractionMarks(): string[] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  return performance
    .getEntriesByType("mark")
    .map((e) => e.name)
    .filter((n) => n.startsWith(INTERACTION_PREFIX) || n.startsWith(STAFF_SUBVIEW_PREFIX));
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
