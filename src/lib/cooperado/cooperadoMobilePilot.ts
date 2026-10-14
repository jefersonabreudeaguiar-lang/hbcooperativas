import type { User } from "@/types";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { isCooperadoAppUser, resolveAppUserRole } from "@/permissions";
import { resolveCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { resolveExperienceUser } from "@/lib/mobileExperience";

/**
 * Piloto mobile cooperado — sessão Jeferson (CoopeagriPla).
 * Manter alinhado a `mobileCooperadoLink` e testes BIC-D1.
 */
export const COOPERADO_MOBILE_PILOT_COOPERADO_ID = "c_1781981564381_w67gg";

export const COOPERADO_MOBILE_PILOT_EMAIL = "jefersonabreudeaguiar@gmail.com";

function cooperadoIdMatchesPilot(cooperadoId: string, coopId: string | undefined): boolean {
  if (cooperadoId === COOPERADO_MOBILE_PILOT_COOPERADO_ID) return true;
  const data = isAppDataWarm() ? getData() : null;
  if (!data || !coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, cooperadoId, coopId);
  return canon === COOPERADO_MOBILE_PILOT_COOPERADO_ID;
}

/**
 * Verdadeiro só para cooperado Jeferson no app mobile/PWA (experiência cooperado).
 * Demais cooperados permanecem no comportamento de produção (GA).
 */
export function isCooperadoMobilePilot(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user) return false;
  const data = isAppDataWarm() ? getData() : null;
  const effective = resolveExperienceUser(user, data) ?? user;
  if (!isCooperadoAppUser(effective) && resolveAppUserRole(effective, data) !== "cooperado") {
    return false;
  }
  const email = normalizeAuthEmail(effective.email ?? "");
  if (email === normalizeAuthEmail(COOPERADO_MOBILE_PILOT_EMAIL)) return true;

  const cooperadoId = effective.cooperadoId?.trim();
  if (!cooperadoId) return false;
  const coopId = (data ? getUserCooperativaId(effective, data) : null) ?? effective.cooperativaId;
  return cooperadoIdMatchesPilot(cooperadoId, coopId);
}

/** Ramo piloto vs GA — use em toda mudança nova de mobile cooperado. */
export function cooperadoMobilePilotOrDefault<T>(
  user: Omit<User, "password"> | null | undefined,
  pilotValue: T,
  productionValue: T
): T {
  return isCooperadoMobilePilot(user) ? pilotValue : productionValue;
}
