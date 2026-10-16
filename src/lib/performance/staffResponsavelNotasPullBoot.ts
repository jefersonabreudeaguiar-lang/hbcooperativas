/**
 * Evita rajada de pulls na abertura da fila (mount + vista + poll + visibility).
 * Rollback: NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS=0
 */

function readBootDelayMs(): number {
  if (typeof process === "undefined") return 6_000;
  const raw = (process.env.NEXT_PUBLIC_STAFF_NOTAS_POLL_BOOT_DELAY_MS ?? "6000").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 6_000;
  return Math.round(n);
}

export function scheduleStaffResponsavelNotasPollLoop(opts: {
  pollIntervalMs: number;
  onPoll: () => void;
  onVisible: () => void;
}): () => void {
  if (typeof window === "undefined") return () => undefined;

  let intervalId = 0;
  let bootTimer = 0;
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    const onVisible = () => {
      if (document.hidden) return;
      opts.onVisible();
    };
    document.addEventListener("visibilitychange", onVisible);
    intervalId = window.setInterval(() => {
      if (document.hidden) return;
      opts.onPoll();
    }, opts.pollIntervalMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalId) window.clearInterval(intervalId);
    };
  };

  let teardownPoll: (() => void) | undefined;
  const delay = readBootDelayMs();
  if (delay <= 0) {
    teardownPoll = start();
  } else {
    bootTimer = window.setTimeout(() => {
      teardownPoll = start();
    }, delay);
  }

  return () => {
    if (bootTimer) window.clearTimeout(bootTimer);
    teardownPoll?.();
  };
}
