/**
 * PWA cooperado mobile — modo mensageiro: UI lê snapshots locais; ver cooperadoPwaMessengerMode.ts.
 */
import type { User } from "@/types";
import { isCooperadoPwaMobileEntregasLeve } from "@/lib/cooperado/cooperadoPwaMobileEntregas";
import { persistirCooperadoPwaInicioDashboardSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaInicioDashboardSnapshot";
import { persistirCooperadoPwaFichaResumoSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import { persistirCooperadoPwaEntregasResumosSnapshotFromUser } from "@/lib/cooperado/cooperadoPwaEntregasResumosSnapshot";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { gravarReciboAssinadoLocalLatch } from "@/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";

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

/** Card + snapshot do painel Início (mesma leitura do motor). */
export function refreshCooperadoPwaInicioCachesFromMotor(
  user: Omit<User, "password"> | null | undefined,
  apresentacaoConsolidada = true
): boolean {
  if (!user || user.role !== "cooperado") return false;
  const ok = persistirInicioCardValorReceberCooperado(user);
  if (isAppDataWarm()) {
    persistirCooperadoPwaInicioDashboardSnapshotFromUser(user, apresentacaoConsolidada);
  }
  if (isCooperadoPwaMobileLeveUi()) {
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  }
  return ok;
}

/** Grava card “A receber” e avisa Início/Entregas PWA para reler localStorage. */
export function persistirInicioCardCooperadoNotificarPwaLeve(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return refreshCooperadoPwaInicioCachesFromMotor(user, true);
}

/** Após assinar recibo localmente — evita Início/Ficha reler snapshot antigo com recibo pendente. */
export function materializarCooperadoPwaAposAssinaturaReciboLocal(
  user: Omit<User, "password">,
  apresentacaoConsolidada: boolean,
  pagamentoId?: string
): void {
  if (user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return;
  const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (pagamentoId) {
    gravarReciboAssinadoLocalLatch(cooperadoId, coopId, pagamentoId);
  }
  refreshCooperadoPwaInicioCachesFromMotor(user, apresentacaoConsolidada);
  persistirCooperadoPwaFichaResumoSnapshotFromUser(user, apresentacaoConsolidada);
  persistirCooperadoPwaEntregasResumosSnapshotFromUser(user);
}
