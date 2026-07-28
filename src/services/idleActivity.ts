/**
 * Detecta ociosidade do usuário para pausar sync automático
 * e economizar Edge Requests na Vercel.
 *
 * - Ocioso: sem toque/clique/tecla/scroll por IDLE_TIMEOUT_MS, ou aba em segundo plano
 * - Acorda: usuário abre o app (aba visível) ou interage de novo
 */

export const IDLE_TIMEOUT_MS = 2 * 60 * 1000;

type IdleListener = (idle: boolean) => void;

let lastActivityAt = Date.now();
let idle = false;
let monitorStarted = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<IdleListener>();

function notify(next: boolean) {
  if (idle === next) return;
  idle = next;
  for (const fn of listeners) {
    try {
      fn(idle);
    } catch {
      /* ignore */
    }
  }
}

function scheduleIdleCheck() {
  if (idleTimer) clearTimeout(idleTimer);
  if (typeof document !== "undefined" && document.hidden) {
    notify(true);
    return;
  }
  const elapsed = Date.now() - lastActivityAt;
  const remaining = IDLE_TIMEOUT_MS - elapsed;
  if (remaining <= 0) {
    notify(true);
    return;
  }
  notify(false);
  idleTimer = setTimeout(() => {
    if (typeof document !== "undefined" && document.hidden) {
      notify(true);
      return;
    }
    if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
      notify(true);
    }
  }, remaining);
}

/** Marca atividade do usuário e acorda o sync se estava ocioso. */
export function markUserActivity(): void {
  lastActivityAt = Date.now();
  if (typeof document !== "undefined" && document.hidden) return;
  const wasIdle = idle;
  scheduleIdleCheck();
  if (wasIdle) notify(false);
}

export function isAppIdle(): boolean {
  if (typeof document !== "undefined" && document.hidden) return true;
  return idle || Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS;
}

export function onAppIdleChange(listener: IdleListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Inicia monitoramento global (uma vez). */
export function startIdleMonitor(): () => void {
  if (typeof window === "undefined") return () => {};
  if (monitorStarted) return () => {};
  monitorStarted = true;

  const onActivity = () => markUserActivity();
  const events: Array<keyof WindowEventMap> = [
    "pointerdown",
    "touchstart",
    "keydown",
    "scroll",
  ];

  for (const ev of events) {
    window.addEventListener(ev, onActivity, { passive: true, capture: true });
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      markUserActivity();
    } else {
      notify(true);
      if (idleTimer) clearTimeout(idleTimer);
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  scheduleIdleCheck();

  return () => {
    monitorStarted = false;
    for (const ev of events) {
      window.removeEventListener(ev, onActivity, true);
    }
    document.removeEventListener("visibilitychange", onVisibility);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };
}
