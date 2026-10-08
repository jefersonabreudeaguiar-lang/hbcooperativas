/**
 * PWA cooperado mobile — snapshots de UI (Início/Entregas) desligados em favor de AppData ao vivo.
 * Mantém helpers de persistência do card e eventos para compatibilidade.
 */
import type { User } from "@/types";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";

/** Snapshot leve desligado — telas cooperado leem AppData quando a aba está ativa. */
export function isCooperadoPwaMobileLeveUi(): boolean {
  return false;
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

/** Grava card “A receber” (cache local); não troca Início para modo somente persistido. */
export function persistirInicioCardCooperadoNotificarPwaLeve(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado") return false;
  return persistirInicioCardValorReceberCooperado(user);
}
