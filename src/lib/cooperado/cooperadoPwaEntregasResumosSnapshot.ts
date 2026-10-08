/**
 * Cache local dos resumos da aba Entregas/Ficha (cooperado PWA mobile) — evita recalcular a cada sync.
 */
import type { User } from "@/types";
import type { AppData } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import { filtrarResumosMesesNaoQuitados } from "@/services/cooperadoEntregasService";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";
import { bicCentralListarResumosMensaisEntregas } from "@/services/bicLeituraCentralCooperado";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION = 1;

export const COOPERADO_PWA_ENTREGAS_SNAPSHOT_REFRESH_EVENT =
  "hb-cooperado-pwa-entregas-snapshot-refresh";

export type CooperadoPwaEntregasResumosSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  /** Base mensal (antes do filtro de status na UI). */
  entregasBase: ResumoMesEntregasCooperado[];
  fichaAberto: ResumoMesEntregasCooperado[];
};

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return `hb.coop.pwaEntregasResumos.v${COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION}:${cooperativaId}:${cooperadoId}`;
}

export function buildCooperadoPwaEntregasResumosSnapshot(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaEntregasResumosSnapshot {
  const entregasBase = filtrarResumosMesesNaoQuitados(
    data,
    cooperadoId,
    bicCentralListarResumosMensaisEntregas(data, cooperadoId, cooperativaId)
  );
  const fichaAberto = listarResumosFichaEmAbertoCooperado(data, cooperadoId, cooperativaId);
  return {
    v: COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    entregasBase,
    fichaAberto,
  };
}

export function lerCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaEntregasResumosSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaEntregasResumosSnapshot;
    if (parsed.v !== COOPERADO_PWA_ENTREGAS_SNAPSHOT_VERSION || !Array.isArray(parsed.entregasBase)) {
      return null;
    }
    if (parsed.appBuild !== APP_BUILD_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  payload: CooperadoPwaEntregasResumosSnapshot
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaEntregasResumosSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  data?: AppData | null
): CooperadoPwaEntregasResumosSnapshot | null {
  const d = data ?? (isAppDataWarm() ? getData() : null);
  if (!d) return null;
  const canon = resolverCooperadoIdCanonico(d, cooperadoId, cooperativaId);
  const built = buildCooperadoPwaEntregasResumosSnapshot(d, canon, cooperativaId);
  gravarCooperadoPwaEntregasResumosSnapshot(canon, cooperativaId, built);
  return built;
}

export function persistirCooperadoPwaEntregasResumosSnapshotFromUser(
  user: Omit<User, "password">
): CooperadoPwaEntregasResumosSnapshot | null {
  if (user.role !== "cooperado" || !user.cooperadoId) return null;
  const d = isAppDataWarm() ? getData() : null;
  const coopId = (d ? getUserCooperativaId(user, d) : undefined) ?? user.cooperativaId;
  if (!coopId) return null;
  return persistirCooperadoPwaEntregasResumosSnapshot(user.cooperadoId, coopId, d);
}

export function dispatchCooperadoPwaEntregasSnapshotRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOPERADO_PWA_ENTREGAS_SNAPSHOT_REFRESH_EVENT));
}
