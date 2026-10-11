/**
 * PWA mensageiro — indica quando snapshots locais faltam ou a nuvem está à frente (sem poll extra na UI).
 */
import type { User } from "@/types";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaFinanceiroSnapshotsAusentes } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { readAppliedCooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";

export const COOPERADO_PWA_DADOS_STALE_EVENT = "hb-cooperado-pwa-dados-stale";
export const COOPERADO_PWA_DADOS_FRESH_EVENT = "hb-cooperado-pwa-dados-fresh";

let revisaoNuvemAdiantada = false;

export function markCooperadoPwaRevisaoNuvemAdiantada(): void {
  if (!isCooperadoPwaMessengerMode()) return;
  revisaoNuvemAdiantada = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOPERADO_PWA_DADOS_STALE_EVENT));
  }
}

export function clearCooperadoPwaDadosDesatualizados(): void {
  revisaoNuvemAdiantada = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOPERADO_PWA_DADOS_FRESH_EVENT));
  }
}

export function cooperadoPwaRevisaoNuvemAdiantada(): boolean {
  return revisaoNuvemAdiantada;
}

/** Notas inalteradas na nuvem desde a última sync aplicada — pull só operacional é seguro. */
export function cooperadoCloudRevisionNotasInSyncWithApplied(
  cnpj: string,
  remote: CooperativaCloudRevision
): boolean {
  const applied = readAppliedCooperativaCloudRevision(cnpj);
  if (!applied) return false;
  const parts = applied.split("|");
  return (parts[3] ?? "") === (remote.notasUpdatedAt ?? "");
}

export function cooperadoPwaFinanceiroSnapshotsAusentesForUser(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (!isCooperadoPwaMessengerMode()) return false;
  const data = isAppDataWarm() ? getData() : null;
  const coopId = data
    ? getUserCooperativaId(user, data) ?? user.cooperativaId
    : user.cooperativaId;
  if (!coopId) return true;
  const canon = data
    ? resolverCooperadoIdCanonico(data, user.cooperadoId, coopId)
    : user.cooperadoId;
  return cooperadoPwaFinanceiroSnapshotsAusentes(canon, coopId);
}

export function cooperadoPwaMostraDadosDesatualizados(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!isCooperadoPwaMessengerMode() || !user || user.role !== "cooperado") return false;
  if (cooperadoPwaRevisaoNuvemAdiantada()) return true;
  return cooperadoPwaFinanceiroSnapshotsAusentesForUser(user);
}
