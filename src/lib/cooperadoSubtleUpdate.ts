/** Aviso discreto após sync em segundo plano (cooperado e responsável). */
export const APP_SUBTLE_UPDATE_EVENT = "hb-app-subtle-update";
/** @deprecated use APP_SUBTLE_UPDATE_EVENT */
export const COOPERADO_SUBTLE_UPDATE_EVENT = APP_SUBTLE_UPDATE_EVENT;

export function notifyAppSubtleUpdate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_SUBTLE_UPDATE_EVENT));
}

export function notifyCooperadoSubtleUpdate(): void {
  notifyAppSubtleUpdate();
}
