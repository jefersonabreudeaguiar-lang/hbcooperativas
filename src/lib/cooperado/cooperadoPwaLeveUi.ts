/**
 * PWA cooperado mobile — modo mensageiro: UI lê snapshots locais; ver cooperadoPwaMessengerMode.ts.
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileEntregasLeve } from "@/lib/cooperado/cooperadoPwaMobileEntregas";
import { persistirCooperadoPwaInicioDashboardSnapshot } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { getUserCooperativaId } from "@/utils/cooperativa";

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

/** Após assinar recibo localmente — evita Início/Ficha reler snapshot antigo com recibo pendente. */
export function materializarCooperadoPwaAposAssinaturaReciboLocal(
  user: Omit<User, "password">,
  apresentacaoConsolidada: boolean
): void {
  if (user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return;
  persistirInicioCardValorReceberCooperado(user);
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  persistirCooperadoPwaInicioDashboardSnapshot(
    cooperadoId,
    coopId,
    user,
    apresentacaoConsolidada,
    data
  );
  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, apresentacaoConsolidada);
  if (isCooperadoPwaMobileLeveUi()) {
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  }
}
