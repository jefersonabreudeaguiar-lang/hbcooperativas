/**
 * PWA cooperado mobile — modo mensageiro: UI lê snapshots locais; ver cooperadoPwaMessengerMode.ts.
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileEntregasLeve } from "@/lib/cooperado/cooperadoPwaMobileEntregas";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";

export function isCooperadoPwaMobileLeveUi(): boolean {
  return isCooperadoPwaMobileEntregasLeve();
}

export const COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT =
  "hb-cooperado-pwa-leve-ui-snapshot-refresh";

/** @deprecated Use COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT */
export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_REFRESH_EVENT =
  COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT;

export function dispatchCooperadoPwaLeveUiSnapshotRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOPERADO_PWA_LEVE_UI_SNAPSHOT_REFRESH_EVENT));
}

/** Grava card “A receber” e avisa Início/Entregas PWA para reler localStorage. */
export function persistirInicioCardCooperadoNotificarPwaLeve(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  const ok = persistirInicioCardValorReceberCooperado(user);
  if (isCooperadoPwaMobileLeveUi()) {
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  }
  return ok;
}
