/** Aviso discreto no cooperado após sync em segundo plano (sem bloquear a tela). */
export const COOPERADO_SUBTLE_UPDATE_EVENT = "hb-cooperado-subtle-update";

export function notifyCooperadoSubtleUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOPERADO_SUBTLE_UPDATE_EVENT));
}
