/**
 * Janela após troca de aba — UI fluida; sync/rematerialização pesada espera.
 */
const UNTIL_KEY = "hb.coop.tab-hop-quiet-until";
const LAST_PATH_KEY = "hb.coop.tab-hop-last-path";
/** Celular cooperado — margem para pintar a aba antes de sync/rematerialização. */
const QUIET_MS = 14_000;

export function markCooperadoTabPathChange(pathname: string): void {
  if (typeof sessionStorage === "undefined") return;
  const path = (pathname || "/").trim() || "/";
  try {
    const prev = sessionStorage.getItem(LAST_PATH_KEY);
    if (prev && prev !== path) {
      sessionStorage.setItem(UNTIL_KEY, String(Date.now() + QUIET_MS));
    }
    sessionStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    /* quota */
  }
}

export function cooperadoTabSwitchQuiescenceActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}

/** Troca de aba — não rodar sync/rematerialização pesada na thread principal. */
export function cooperadoMobileUiQuiescenceActive(): boolean {
  return cooperadoTabSwitchQuiescenceActive();
}
