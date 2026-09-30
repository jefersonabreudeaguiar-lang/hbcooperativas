/** Agenda sync aux HB fora do caminho crítico de clique/navegação. */

export function scheduleContaCoopAuxSync(
  run: () => void,
  opts?: { idleTimeoutMs?: number; fallbackMs?: number }
): () => void {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  const invoke = () => {
    if (cancelled) return;
    run();
  };

  const idleTimeoutMs = opts?.idleTimeoutMs ?? 12_000;
  const fallbackMs = opts?.fallbackMs ?? 4_000;

  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(invoke, { timeout: idleTimeoutMs });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(id);
    };
  }

  const timer = window.setTimeout(invoke, fallbackMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
