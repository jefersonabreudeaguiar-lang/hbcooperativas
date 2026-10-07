/**
 * Fase 1 — relatório read-only de rotas reais (cooperado + responsável).
 * Não altera sync, dados, fichas ou lançamentos.
 */
import {
  listRqlInteractionMarks,
  listRqlRouteMarks,
  summarizeRqlRouteTimings,
  type RqlRouteTimingRow,
} from "@/lib/performance/rqlMarks";
import {
  buildMessagingParityReport,
  formatMessagingParitySummary,
  type MessagingParityReport,
} from "@/lib/performance/messagingAppPerfParity";

export type RqlPerfPercentiles = {
  count: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  max: number | null;
};

export type RqlPerfRouteReport = {
  generatedAt: string;
  sloL1PaintP75Ms: number;
  routeTransitions: RqlRouteTimingRow[];
  paintPercentiles: RqlPerfPercentiles;
  routeMarks: string[];
  interactionMarks: string[];
  longTasksSample: Array<{ name: string; duration: number; startTime: number }>;
};

const DEFAULT_SLO_L1_P75_MS = 200;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)] * 10) / 10;
}

export function computePaintPercentiles(rows: RqlRouteTimingRow[]): RqlPerfPercentiles {
  const values = rows
    .map((r) => r.paintMs)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { count: 0, p50: null, p75: null, p95: null, max: null };
  }
  return {
    count: values.length,
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p95: percentile(values, 95),
    max: values[values.length - 1] ?? null,
  };
}

function collectLongTaskSample(limit = 20): RqlPerfRouteReport["longTasksSample"] {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return [];
  }
  try {
    const entries = performance.getEntriesByType("longtask") as PerformanceEntry[];
    return entries
      .slice(-limit)
      .map((e) => ({
        name: e.name || "longtask",
        duration: Math.round(e.duration * 10) / 10,
        startTime: Math.round(e.startTime * 10) / 10,
      }));
  } catch {
    return [];
  }
}

export function buildRqlPerfRouteReport(sloL1PaintP75Ms = DEFAULT_SLO_L1_P75_MS): RqlPerfRouteReport {
  const routeTransitions = summarizeRqlRouteTimings();
  const paintPercentiles = computePaintPercentiles(routeTransitions);
  return {
    generatedAt: new Date().toISOString(),
    sloL1PaintP75Ms,
    routeTransitions,
    paintPercentiles,
    routeMarks: listRqlRouteMarks(),
    interactionMarks: listRqlInteractionMarks(),
    longTasksSample: collectLongTaskSample(),
  };
}

export function isRqlPerfDebugEnabled(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-rql-perf-debug") === "1") return true;
  }
  const raw =
    typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_RQL_PERF_DEBUG ?? "") : "";
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function formatRqlPerfReportSummary(report: RqlPerfRouteReport): string {
  const { paintPercentiles: p, sloL1PaintP75Ms } = report;
  const sloOk =
    p.p75 != null ? (p.p75 <= sloL1PaintP75Ms ? "OK" : "ACIMA") : "sem amostra";
  return [
    `RQL Fase 1 — ${report.generatedAt}`,
    `Transições rota: ${report.routeTransitions.length} | paint p75=${p.p75 ?? "—"}ms (SLO ${sloL1PaintP75Ms}ms: ${sloOk})`,
    `Interações: ${report.interactionMarks.length} marcas | long tasks amostra: ${report.longTasksSample.length}`,
  ].join("\n");
}

export type RqlPerfDebugHandle = {
  report: () => RqlPerfRouteReport;
  summary: () => string;
  print: () => RqlPerfRouteReport;
  whatsappCompare: () => MessagingParityReport;
  printWhatsappCompare: () => MessagingParityReport;
};

/** Instala `window.__hbRqlPerf` — só quando debug ligado (homolog). */
export function installRqlPerfDebugGlobal(): () => void {
  if (typeof window === "undefined" || !isRqlPerfDebugEnabled()) {
    return () => undefined;
  }

  const handle: RqlPerfDebugHandle = {
    report: () => buildRqlPerfRouteReport(),
    summary: () => formatRqlPerfReportSummary(buildRqlPerfRouteReport()),
    print: () => {
      const r = buildRqlPerfRouteReport();
      console.info(formatRqlPerfReportSummary(r));
      console.table(r.routeTransitions);
      if (r.interactionMarks.length) console.log("interactions", r.interactionMarks);
      return r;
    },
    whatsappCompare: () => buildMessagingParityReport(buildRqlPerfRouteReport()),
    printWhatsappCompare: () => {
      const r = buildMessagingParityReport(buildRqlPerfRouteReport());
      console.info(formatMessagingParitySummary(r));
      console.table(
        r.dimensions.map((d) => ({
          id: d.id,
          label: d.label,
          whatsapp: d.whatsappScore,
          hbCoop: d.hbCoopScore,
          waMs: d.whatsappValue,
          hbMs: d.hbCoopValue,
        }))
      );
      return r;
    },
  };

  (window as Window & { __hbRqlPerf?: RqlPerfDebugHandle }).__hbRqlPerf = handle;

  let obs: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined") {
    try {
      obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration >= 50 && typeof performance.mark === "function") {
            try {
              performance.mark(`rql:longtask:${Math.round(e.duration)}ms`);
            } catch {
              /* quota */
            }
          }
        }
      });
      obs.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
    } catch {
      obs = null;
    }
  }

  return () => {
    obs?.disconnect();
    delete (window as Window & { __hbRqlPerf?: RqlPerfDebugHandle }).__hbRqlPerf;
  };
}
