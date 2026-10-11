/**
 * Reidrata snapshots PWA a partir do AppData local (sem sync na nuvem) quando build/snapshot v2 faltam.
 */
import type { User } from "@/types";
import { cooperadoPwaSnapshotBuildReadable } from "@/lib/cooperado/cooperadoPwaSnapshotBuildPolicy";
import { lerCooperadoPwaFichaResumoSnapshot } from "@/lib/cooperado/cooperadoPwaFichaResumoSnapshot";
import {
  isCooperadoPwaMessengerMode,
  persistirCooperadoPwaMessengerCaches,
} from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";

export function cooperadoPwaFichaSnapshotPrecisaRematerializar(
  cooperadoId: string,
  cooperativaId: string
): boolean {
  const snap = lerCooperadoPwaFichaResumoSnapshot(cooperadoId, cooperativaId);
  if (!snap) return true;
  if (!cooperadoPwaSnapshotBuildReadable(snap.appBuild)) return true;
  if (snap.v < 2 || !snap.paridade) return true;
  return false;
}

/** AppData já warm no dispositivo — grava snapshots v2 sem ir à nuvem. */
export function rematerializarCooperadoPwaSnapshotsSeNecessario(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !user.cooperadoId || !isCooperadoPwaMessengerMode()) {
    return false;
  }
  if (!isAppDataWarm()) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  if (!cooperadoPwaFichaSnapshotPrecisaRematerializar(canon, coopId)) return false;
  persistirCooperadoPwaMessengerCaches(user);
  return true;
}

export function cooperadoPwaMessengerPrecisaSyncOperacionalInicial(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoPwaMessengerMode()) return false;
  if (!cooperadoAppReleaseNeedsOperacionalSync()) return false;
  if (!isAppDataWarm()) return true;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId || !user.cooperadoId) return true;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  return cooperadoPwaFichaSnapshotPrecisaRematerializar(canon, coopId);
}
