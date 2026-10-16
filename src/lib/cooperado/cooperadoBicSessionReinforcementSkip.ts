/**
 * Concerto BIC — Movimento II: reforços de sessão sem pull pesado quando nada mudou na nuvem.
 */
import type { User } from "@/types";
import { isCooperadoBicHybridLightEnabled } from "@/lib/cooperado/cooperadoBicHybridLight";
import { cooperadoGaExibicaoFinanceiraAindaZerada } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cloudRevisionChangedSinceApplied } from "@/lib/performance/cooperadoEventDrivenSync";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

const REMAT_PREFIX = "hb.coop.bicSessionRematAt";
export const COOPERADO_BIC_SESSION_REMATERIALIZE_TTL_MS = 90_000;

function rematKey(userId: string): string {
  return `${REMAT_PREFIX}:${userId}`;
}

export function markCooperadoBicSessionRematerialized(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(rematKey(userId), String(Date.now()));
  } catch {
    /* quota */
  }
}

export function cooperadoBicSessionRematerializeRecente(
  userId: string,
  ttlMs = COOPERADO_BIC_SESSION_REMATERIALIZE_TTL_MS
): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(rematKey(userId));
    if (!raw) return false;
    const t = parseInt(raw, 10);
    return Number.isFinite(t) && Date.now() - t < ttlMs;
  } catch {
    return false;
  }
}

/** Reforço (tick > 0): só rematerializa local se revisão já aplicada e card não zerado. */
export async function shouldSkipCooperadoBicSessionReinforcementPull(
  user: Omit<User, "password">,
  tickIndex: number
): Promise<boolean> {
  if (tickIndex <= 0) return false;
  if (!isCooperadoBicHybridLightEnabled()) return false;
  if (cooperadoGaExibicaoFinanceiraAindaZerada(user)) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (!isAppDataWarm()) return false;

  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId || !user.cooperadoId) return false;

  const cnpj = await resolveCooperativaCnpj(data, coopId, user);
  const digits = normalizeCnpj(cnpj ?? "");
  if (digits.length !== 14) return false;

  const remote = await fetchCooperativaCloudRevision(digits);
  if (!remote) return false;
  if (cloudRevisionChangedSinceApplied(digits, remote)) return false;

  return cooperadoBicSessionRematerializeRecente(user.id);
}
