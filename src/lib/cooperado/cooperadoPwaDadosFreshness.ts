/**
 * PWA mensageiro — indica quando snapshots locais faltam ou a nuvem está à frente (sem poll extra na UI).
 */
import type { User } from "@/types";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaFinanceiroSnapshotsAusentes } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { readAppliedCooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { isCooperadoJefersonSomenteAtualizarPilot } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";

export const COOPERADO_PWA_DADOS_STALE_EVENT = "hb-cooperado-pwa-dados-stale";
export const COOPERADO_PWA_DADOS_FRESH_EVENT = "hb-cooperado-pwa-dados-fresh";

/** Evita re-marcar stale logo após sync manual/materialização bem-sucedida. */
const FOREGROUND_STALE_SUPPRESS_MS = 45_000;
let suppressForegroundStaleUntil = 0;

export function clearCooperadoPwaDadosDesatualizados(): void {
  suppressForegroundStaleUntil = Date.now() + FOREGROUND_STALE_SUPPRESS_MS;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COOPERADO_PWA_DADOS_FRESH_EVENT));
  }
}

export function cooperadoPwaSuppressForegroundStaleCheck(): boolean {
  return Date.now() < suppressForegroundStaleUntil;
}

/** @deprecated Não usar — gerava badge “desatualizado” em loop após Atualizar. */
export function markCooperadoPwaRevisaoNuvemAdiantada(): void {
  /* noop */
}

export function cooperadoPwaRevisaoNuvemAdiantada(): boolean {
  return false;
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

/**
 * Badge “desatualizado” só quando não há fatia local útil.
 * Snapshot PWA ausente/divergente com AppData já carregado NÃO alarma nem trava o Atualizar.
 */
export function cooperadoPwaDeveMostrarBadgeDesatualizado(input: {
  messenger: boolean;
  role?: string;
  suppress: boolean;
  appDataWarm: boolean;
  temDadosFinanceirosLocais: boolean;
  snapshotsAusentes: boolean;
}): boolean {
  if (!input.messenger || input.role !== "cooperado") return false;
  if (input.suppress) return false;
  if (!input.appDataWarm) return false;
  if (input.temDadosFinanceirosLocais) return false;
  return input.snapshotsAusentes;
}

export function cooperadoPwaMostraDadosDesatualizados(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!isCooperadoPwaMessengerMode() || !user || user.role !== "cooperado") return false;
  /** Piloto Jeferson — sync automático na 2ª entrada; badge alarmava antes dos dados existirem. */
  if (isCooperadoJefersonSomenteAtualizarPilot(user)) return false;
  const warm = isAppDataWarm();
  let temLocais = false;
  if (warm && user.cooperadoId) {
    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (coopId) {
      const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      temLocais = cooperadoTemDadosFinanceirosMinimos(data, canon, coopId);
    }
  }
  return cooperadoPwaDeveMostrarBadgeDesatualizado({
    messenger: true,
    role: user.role,
    suppress: cooperadoPwaSuppressForegroundStaleCheck(),
    appDataWarm: warm,
    temDadosFinanceirosLocais: temLocais,
    snapshotsAusentes: cooperadoPwaFinanceiroSnapshotsAusentesForUser(user),
  });
}
