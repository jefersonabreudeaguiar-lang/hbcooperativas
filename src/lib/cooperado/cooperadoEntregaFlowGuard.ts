/**
 * Marca fluxo ativo (câmera / anexar / enviar) — adia reload de release/SW para não “resetar” o app.
 */
const SESSION_KEY = "hb_cooperado_entrega_flow_until";

export function markCooperadoEntregaFlowActive(ms = 120_000): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now() + ms));
  } catch {
    /* ignore */
  }
}

export function clearCooperadoEntregaFlowActive(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isCooperadoEntregaFlowActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    if (!until) return false;
    if (Date.now() > until) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
