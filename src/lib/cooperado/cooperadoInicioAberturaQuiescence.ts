/** Após abrir o Início, UI interativa primeiro; sync/BIC pesado espera. */
const UNTIL_KEY = "hb.coop.inicio-abertura-quiet-until";
export const COOPERADO_INICIO_ABERTURA_QUIET_MS = 3_500;

const listeners = new Set<() => void>();
let endTimer: ReturnType<typeof setTimeout> | null = null;

function readUntil(): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    return Number(sessionStorage.getItem(UNTIL_KEY) ?? "0");
  } catch {
    return 0;
  }
}

function emitQuiescenceChange(): void {
  for (const fn of listeners) fn();
}

function scheduleEndEmit(): void {
  if (typeof window === "undefined") return;
  if (endTimer) clearTimeout(endTimer);
  const until = readUntil();
  const remain = until - Date.now();
  if (!Number.isFinite(remain) || remain <= 0) return;
  endTimer = setTimeout(() => {
    endTimer = null;
    emitQuiescenceChange();
  }, remain + 16);
}

/** Uma janela por abertura — não estender a cada re-render do React. */
export function markCooperadoInicioAberturaQuiescence(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const until = readUntil();
    if (Number.isFinite(until) && until > Date.now()) return;
    sessionStorage.setItem(UNTIL_KEY, String(Date.now() + COOPERADO_INICIO_ABERTURA_QUIET_MS));
    emitQuiescenceChange();
    scheduleEndEmit();
  } catch {
    /* quota */
  }
}

export function cooperadoInicioAberturaQuiescenceActive(): boolean {
  const until = readUntil();
  return Number.isFinite(until) && until > 0 && Date.now() < until;
}

export function subscribeCooperadoInicioAberturaQuiescence(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  scheduleEndEmit();
  return () => {
    listeners.delete(onStoreChange);
  };
}
