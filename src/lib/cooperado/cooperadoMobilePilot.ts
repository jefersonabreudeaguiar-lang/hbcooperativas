import type { User } from "@/types";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { isCooperadoAppUser, resolveAppUserRole } from "@/permissions";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
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
 * Cooperado no app — mesma experiência mobile do piloto Jeferson (produção padrão GA).
 * Responsável no celular com painel cooperado também entra quando `resolveExperienceUser` for cooperado.
 */
export function isCooperadoMobileGaPromoted(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user) return false;
  const data = isAppDataWarm() ? getData() : null;
  const effective = resolveExperienceUser(user, data) ?? user;
  if (!isCooperadoAppUser(effective) && resolveAppUserRole(effective, data) !== "cooperado") {
    return false;
  }
  return true;
}

/**
 * Verdadeiro só para cooperado Jeferson — usado na estrela de revisão piloto (ciclos futuros).
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

/** Alias explícito — produção cooperado = experiência Jeferson. */
export const isCooperadoMobileExperienciaJeferson = isCooperadoMobileGaPromoted;

/** Ramo legado “produção antiga” vs piloto — hoje todo cooperado no app usa o ramo piloto. */
export function cooperadoMobilePilotOrDefault<T>(
  user: Omit<User, "password"> | null | undefined,
  pilotValue: T,
  productionValue: T
): T {
  return isCooperadoMobileGaPromoted(user) ? pilotValue : productionValue;
}
