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

type RqlTransitionMark = { transition: string; toHop: string; startTime: number };
type RqlPaintMark = { hop: string; startTime: number };

/**
 * Pareia cada transição com o próximo paint do mesmo hop (cronológico).
 * Evita inflar p75 ao reutilizar o paint mais recente em transições antigas.
 */
export function pairRqlRouteTimingsChronological(
  transitions: readonly RqlTransitionMark[],
  paints: readonly RqlPaintMark[]
): RqlRouteTimingRow[] {
  const paintsByHop = new Map<string, number[]>();
  for (const p of paints) {
    const list = paintsByHop.get(p.hop) ?? [];
    list.push(p.startTime);
    paintsByHop.set(p.hop, list);
  }
  for (const list of paintsByHop.values()) {
    list.sort((a, b) => a - b);
  }
  const paintCursor = new Map<string, number>();
  const sorted = [...transitions].sort((a, b) => a.startTime - b.startTime);
  const rows: RqlRouteTimingRow[] = [];
  for (const t of sorted) {
    const hopPaints = paintsByHop.get(t.toHop) ?? [];
    let idx = paintCursor.get(t.toHop) ?? 0;
    while (idx < hopPaints.length && hopPaints[idx]! < t.startTime) idx++;
    paintCursor.set(t.toHop, idx + 1);
    const paintStart = idx < hopPaints.length ? hopPaints[idx]! : null;
    rows.push({
      transition: t.transition,
      toHop: t.toHop,
      paintMs: paintStart != null ? Math.round((paintStart - t.startTime) * 10) / 10 : null,
    });
  }
  return rows;
}

/** Diagnóstico homolog — pares transição → paint (ms desde o mark de transição). */
export function summarizeRqlRouteTimings(): RqlRouteTimingRow[] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  const marks = performance.getEntriesByType("mark") as PerformanceMark[];
  const transitions: RqlTransitionMark[] = [];
  const paints: RqlPaintMark[] = [];
  for (const m of marks) {
    if (m.name.startsWith(ROUTE_PAINT_PREFIX)) {
      paints.push({ hop: m.name.slice(ROUTE_PAINT_PREFIX.length), startTime: m.startTime });
      continue;
    }
    if (!m.name.startsWith(ROUTE_MARK_PREFIX)) continue;
    const body = m.name.slice(ROUTE_MARK_PREFIX.length);
    const arrow = body.indexOf("->");
    if (arrow < 0) continue;
    transitions.push({
      transition: body,
      toHop: body.slice(arrow + 2),
      startTime: m.startTime,
    });
  }
  return pairRqlRouteTimingsChronological(transitions, paints);
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

export function listRqlColdStartMarks(): PerformanceMark[] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  return (performance.getEntriesByType("mark") as PerformanceMark[])
    .filter((m) => m.name.startsWith(COLD_START_PREFIX))
    .sort((a, b) => a.startTime - b.startTime);
}

let shellVisualMarked = false;
let shellInteractiveMarked = false;

/** ms até shell utilizável — visual → interativo (não inclui sync em background). */
export function measureRqlColdStartSpanMs(): number | null {
  const marks = listRqlColdStartMarks();
  if (marks.length === 0) return null;
  const interactive =
    marks.find((m) => m.name.endsWith("shell_interactive")) ??
    marks.find((m) => m.name.endsWith("local_resume_ready")) ??
    marks.find((m) => m.name.endsWith("post_interactive_task")) ??
    marks.find((m) => m.name.endsWith("staff_post_interactive_task")) ??
    marks[marks.length - 1];
  const visual = marks.find((m) => m.name.endsWith("shell_visual"));
  if (visual && interactive && interactive.startTime >= visual.startTime) {
    const span = interactive.startTime - visual.startTime;
    return Number.isFinite(span) && span >= 0 ? Math.round(span * 10) / 10 : null;
  }
  const first =
    marks.find((m) => m.name.endsWith("cold_start_scheduled")) ??
    marks.find((m) => m.name.endsWith("auth_ready")) ??
    marks[0];
  const span = interactive.startTime - first.startTime;
  return Number.isFinite(span) && span >= 0 ? Math.round(span * 10) / 10 : null;
}

export function measureRqlColdStartFullSpanMs(): number | null {
  const marks = listRqlColdStartMarks();
  if (marks.length === 0) return null;
  const first = marks[0].startTime;
  const interactive =
    marks.find((m) => m.name.endsWith("shell_interactive")) ?? marks[marks.length - 1];
  const span = interactive.startTime - first;
  return Number.isFinite(span) && span >= 0 ? Math.round(span * 10) / 10 : null;
}

/** Header + rodapé cooperado visíveis (antes de dados financeiros). */
export function markRqlShellVisual(): void {
  if (shellVisualMarked) return;
  shellVisualMarked = true;
  markRqlColdStartPhase("shell_visual");
}

/** Shell autenticado pintado — fim de cold start UX (responsável + cooperado). */
export function markRqlShellInteractive(): void {
  if (shellInteractiveMarked) return;
  shellInteractiveMarked = true;
  markRqlColdStartPhase("shell_interactive");
}

export function resetRqlShellMarksForTests(): void {
  shellVisualMarked = false;
  shellInteractiveMarked = false;
}

/** AppData warm + cooperado com fatia financeira utilizável localmente. */
export function markRqlDataReady(): void {
  markRqlColdStartPhase("data_ready");
}
