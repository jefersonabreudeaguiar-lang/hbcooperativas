/**
 * Fase 1 — relatório read-only de rotas reais (cooperado + responsável).
 * Não altera sync, dados, fichas ou lançamentos.
 */
import {
  listRqlInteractionMarks,
  listRqlRouteMarks,
  measureRqlColdStartSpanMs,
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
  coldStartSpanMs: number | null;
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
    coldStartSpanMs: measureRqlColdStartSpanMs(),
    routeMarks: listRqlRouteMarks(),
    interactionMarks: listRqlInteractionMarks(),
    longTasksSample: collectLongTaskSample(),
  };
}

/** Opt-in no aparelho (produção/homolog sem redeploy). */
export const RQL_PERF_DEBUG_STORAGE_KEY = "hb-rql-perf-debug";

const RQL_PERF_DEBUG_URL_PARAM = "hbRqlPerf";

function envRqlPerfDebugOn(): boolean {
  const raw =
    typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_RQL_PERF_DEBUG ?? "") : "";
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function browserRqlPerfDebugOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(RQL_PERF_DEBUG_STORAGE_KEY) === "1") return true;
    if (sessionStorage.getItem(RQL_PERF_DEBUG_STORAGE_KEY) === "1") return true;
  } catch {
    /* modo privado */
  }
  try {
    const q = new URLSearchParams(window.location.search).get(RQL_PERF_DEBUG_URL_PARAM);
    if (q === "1" || q === "true" || q === "yes") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Stub síncrono no <head> — `window.__hbRqlPerf` existe antes do React (evita undefined no console).
 * O bundle substitui pelo handle completo em `installRqlPerfDebugGlobal`.
 */
export function buildInlineRqlPerfStubScript(): string {
  const key = RQL_PERF_DEBUG_STORAGE_KEY;
  const param = RQL_PERF_DEBUG_URL_PARAM;
  return `(function(){var KEY=${JSON.stringify(key)};var PARAM=${JSON.stringify(param)};function applyUrl(){try{var q=new URLSearchParams(location.search).get(PARAM);if(q==="1"||q==="true"||q==="yes")sessionStorage.setItem(KEY,"1");}catch(e){}}applyUrl();function hint(){var b=document.documentElement.getAttribute("data-app-build")||"?";console.info("[HB RQL] build "+b+" — medição completa após o app carregar. Se vazio: localStorage.setItem(\\""+KEY+"\\",\\"1\\"); location.reload(); ou ?"+PARAM+"=1");}var stub={__hbRqlStub:1,printWhatsappCompare:function(){hint();return null;},whatsappCompare:function(){hint();return null;},print:function(){hint();return null;},report:function(){hint();return null;},summary:function(){hint();return "";}};if(!window.__hbRqlPerf||window.__hbRqlPerf.__hbRqlStub)window.__hbRqlPerf=stub;if(!window.__hbRq1Perf||window.__hbRq1Perf.__hbRqlStub)window.__hbRq1Perf=stub;})();`;
}

/** `?hbRqlPerf=1` na URL grava flag de sessão antes do bootstrap React. */
export function ensureRqlPerfDebugOptInFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(window.location.search).get(RQL_PERF_DEBUG_URL_PARAM);
    if (q === "1" || q === "true" || q === "yes") {
      sessionStorage.setItem(RQL_PERF_DEBUG_STORAGE_KEY, "1");
    }
  } catch {
    /* ignore */
  }
}

export function isRqlPerfDebugEnabled(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-rql-perf-debug") === "1") return true;
  }
  if (envRqlPerfDebugOn()) return true;
  return browserRqlPerfDebugOn();
}

export type RqlPerfDebugHandle = {
  report: () => RqlPerfRouteReport;
  summary: () => string;
  print: () => RqlPerfRouteReport;
  whatsappCompare: () => MessagingParityReport;
  printWhatsappCompare: () => MessagingParityReport;
};

function logRqlPerfDebugOffHint(): void {
  console.info(
    `[HB RQL] Medição desligada neste build. Para ativar neste aparelho:
  localStorage.setItem("${RQL_PERF_DEBUG_STORAGE_KEY}","1"); location.reload();
  ou abra qualquer rota com ?${RQL_PERF_DEBUG_URL_PARAM}=1
  ou na Vercel: NEXT_PUBLIC_RQL_PERF_DEBUG=1 e redeploy.`
  );
}

function buildRqlPerfDebugHandle(enabled: boolean): RqlPerfDebugHandle {
  const maybeHint = () => {
    if (!enabled) logRqlPerfDebugOffHint();
  };
  return {
    report: () => {
      maybeHint();
      return buildRqlPerfRouteReport();
    },
    summary: () => {
      maybeHint();
      return formatRqlPerfReportSummary(buildRqlPerfRouteReport());
    },
    print: () => {
      maybeHint();
      const r = buildRqlPerfRouteReport();
      if (enabled) {
        console.info(formatRqlPerfReportSummary(r));
        console.table(r.routeTransitions);
        if (r.interactionMarks.length) console.log("interactions", r.interactionMarks);
      }
      return r;
    },
    whatsappCompare: () => {
      maybeHint();
      return buildMessagingParityReport(buildRqlPerfRouteReport());
    },
    printWhatsappCompare: () => {
      maybeHint();
      const r = buildMessagingParityReport(buildRqlPerfRouteReport());
      if (enabled) {
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
      }
      return r;
    },
  };
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

/**
 * Instala `window.__hbRqlPerf` (sempre existe; medição completa só com debug ligado).
 * Cleanup remove handle e observer.
 */
export function installRqlPerfDebugGlobal(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const enabled = isRqlPerfDebugEnabled();
  const handle = buildRqlPerfDebugHandle(enabled);

  const w = window as Window & {
    __hbRqlPerf?: RqlPerfDebugHandle;
    /** Alias legado (typo comum no console: Rq1 em vez de Rql). */
    __hbRq1Perf?: RqlPerfDebugHandle;
  };
  w.__hbRqlPerf = handle;
  w.__hbRq1Perf = handle;

  let obs: PerformanceObserver | null = null;
  if (enabled && typeof PerformanceObserver !== "undefined") {
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
  };
}
