const ENABLED_KEY = "hb-coop-data-warm-trace-enabled";
const TRACE_KEY = "hb-coop-startup-trace";

/** Instrumentação temporária ativada somente pelo diagnóstico manual do piloto. */
export function traceCooperadoStartup(stage: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(ENABLED_KEY) !== "1") return;
    const raw = window.localStorage.getItem(TRACE_KEY);
    const trace = raw ? (JSON.parse(raw) as Array<{ stage: string; atMs: number }>) : [];
    if (trace.some((entry) => entry.stage === stage)) return;
    trace.push({ stage, atMs: Math.round(performance.now() * 10) / 10 });
    window.localStorage.setItem(TRACE_KEY, JSON.stringify(trace.slice(-50)));
  } catch {
    // O diagnóstico opcional não pode interferir na abertura do app.
  }
}
