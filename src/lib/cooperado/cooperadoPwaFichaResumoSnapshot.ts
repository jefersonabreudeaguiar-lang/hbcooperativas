/**
 * Read model leve da aba Financeiro/Ficha (cooperado PWA mensageiro) — materializado pós-sync.
 */
import type { AppData, User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";
import {
  bicCentralGetConsolidadoFinanceiroCooperado,
  bicCentralMesPrincipalQuantoVouReceber,
} from "@/services/bicLeituraCentralCooperado";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";

export const COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION = 1;

export type CooperadoPwaFichaResumoSnapshot = {
  v: number;
  appBuild: number;
  savedAt: string;
  fichaAberto: ResumoMesEntregasCooperado[];
  mesPrincipal: ReturnType<typeof bicCentralMesPrincipalQuantoVouReceber>;
  consolidado: ReturnType<typeof bicCentralGetConsolidadoFinanceiroCooperado>;
};

function storageKey(cooperadoId: string, cooperativaId: string): string {
  return `hb.coop.pwaFichaResumo.v${COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION}:${cooperativaId}:${cooperadoId}`;
}

export function buildCooperadoPwaFichaResumoSnapshot(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string,
  apresentacaoConsolidada: boolean
): CooperadoPwaFichaResumoSnapshot {
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, cooperativaId);
  const fichaAberto = listarResumosFichaEmAbertoCooperado(data, canon, cooperativaId);
  const mesPrincipal = bicCentralMesPrincipalQuantoVouReceber(data, canon, cooperativaId, {
    apresentacaoConsolidada,
  });
  const consolidado = bicCentralGetConsolidadoFinanceiroCooperado(data, canon, cooperativaId);
  return {
    v: COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION,
    appBuild: APP_BUILD_VERSION,
    savedAt: new Date().toISOString(),
    fichaAberto,
    mesPrincipal,
    consolidado,
  };
}

export function lerCooperadoPwaFichaResumoSnapshot(
  cooperadoId: string,
  cooperativaId: string
): CooperadoPwaFichaResumoSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(cooperadoId, cooperativaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CooperadoPwaFichaResumoSnapshot;
    if (parsed.v !== COOPERADO_PWA_FICHA_RESUMO_SNAPSHOT_VERSION || !Array.isArray(parsed.fichaAberto)) {
      return null;
    }
    if (parsed.appBuild !== APP_BUILD_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function gravarCooperadoPwaFichaResumoSnapshot(
  cooperadoId: string,
  cooperativaId: string,
  payload: CooperadoPwaFichaResumoSnapshot
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(cooperadoId, cooperativaId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function persistirCooperadoPwaFichaResumoSnapshotFromUser(
  user: Omit<User, "password">,
  apresentacaoConsolidada = true
): CooperadoPwaFichaResumoSnapshot | null {
  if (user.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return null;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return null;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  const built = buildCooperadoPwaFichaResumoSnapshot(data, canon, coopId, apresentacaoConsolidada);
  gravarCooperadoPwaFichaResumoSnapshot(canon, coopId, built);
  return built;
}
