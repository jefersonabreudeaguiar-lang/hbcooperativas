/** Eventos PWA leve — módulo sem dependências de snapshot/materialização (evita ciclo de bundle). */

export const COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT =
  "hb-cooperado-pwa-leve-ui-snapshot-refresh";

/** @deprecated Use COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT */
export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_REFRESH_EVENT =
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT;

export function dispatchCooperadoPwaLeveUiSnapshotRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT));
}
