/** PC gestão — após login, sync automática fica em espera para o painel responder. */
const WARMUP_MS = 120_000;

let sessionStartedAt = 0;
let marked = false;

export function markStaffGestaoDesktopSessionStart(): void {
  if (marked) return;
  marked = true;
  sessionStartedAt = Date.now();
}

export function staffGestaoDesktopWarmupSyncPaused(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 1023px)").matches) return false;
  if (sessionStartedAt <= 0) return false;
  return Date.now() - sessionStartedAt < WARMUP_MS;
}
