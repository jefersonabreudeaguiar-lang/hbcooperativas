/** Após abrir o Início, UI interativa primeiro; sync/BIC pesado espera. */
const UNTIL_KEY = "hb.coop.inicio-abertura-quiet-until";
const QUIET_MS = 8_000;

export function markCooperadoInicioAberturaQuiescence(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(UNTIL_KEY, String(Date.now() + QUIET_MS));
  } catch {
    /* quota */
  }
}

export function cooperadoInicioAberturaQuiescenceActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(UNTIL_KEY) ?? "0");
    return Number.isFinite(until) && until > 0 && Date.now() < until;
  } catch {
    return false;
  }
}
