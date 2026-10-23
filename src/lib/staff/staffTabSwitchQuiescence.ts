/**
 * Janela após troca de aba da gestão — UI fluida; sync/pull espera.
 */
const UNTIL_KEY = "hb.staff.tab-hop-quiet-until";
const LAST_PATH_KEY = "hb.staff.tab-hop-last-path";
const QUIET_MS = 10_000;

export function markStaffTabPathChange(pathname: string): void {
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

export function staffTabSwitchQuiescenceActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}
