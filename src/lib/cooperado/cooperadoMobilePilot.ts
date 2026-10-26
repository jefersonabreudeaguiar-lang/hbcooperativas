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
  /** Sessão cooperado — GA mesmo antes do AppData aquecer (abertura Orlando / demais). */
  if (user.role === "cooperado") return true;
  const data = isAppDataWarm() ? getData() : null;
  const effective = resolveExperienceUser(user, data) ?? user;
  const role = resolveAppUserRole(effective, data);
  if (role === "cooperado") return true;
  return isCooperadoAppUser(effective);
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

/** Abertura fluida (shell + abas) — não bloquear UI no financeiro enquanto AppData aquece. */
export function cooperadoMobilePadraoJefersonAberturaFluida(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoMobileGaPromoted(user);
}

/**
 * PWA/browser cooperado GA: sync operacional completo só no «Atualizar» (não na abertura).
 * Evita travar a UI após deploy quando `hb-coop-operacional-synced-build` ≠ build atual.
 */
export function cooperadoMobileDeferOperacionalSyncNaAbertura(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoMobileGaPromoted(user);
}

/**
 * Abertura cooperado: operacional/notas só no «Atualizar».
 * `force` / sessão BIC não furam isto — era o que travava o celular no 1º segundo.
 */
export function cooperadoGaAberturaBloqueiaPullOperacionalNuvem(
  user: Omit<User, "password"> | null | undefined,
  opts?: { userInitiated?: boolean }
): boolean {
  return cooperadoMobileDeferOperacionalSyncNaAbertura(user) && !opts?.userInitiated;
}

/** Ramo legado “produção antiga” vs piloto — hoje todo cooperado no app usa o ramo piloto. */
export function cooperadoMobilePilotOrDefault<T>(
  user: Omit<User, "password"> | null | undefined,
  pilotValue: T,
  productionValue: T
): T {
  return isCooperadoMobileGaPromoted(user) ? pilotValue : productionValue;
}

/** Viewport cooperado no celular (PWA ou Chrome mobile). */
export function cooperadoGaMobileViewportAtivo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(max-width: 1023px)").matches;
  } catch {
    return true;
  }
}

/**
 * Início GA no celular: só casca + card leve — sem `buildCooperadoPwaInicioDashboardView`
 * (evita crash do renderer Chrome).
 */
export function cooperadoGaInicioSomenteCasca(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return Boolean(user && isCooperadoMobileGaPromoted(user) && cooperadoGaMobileViewportAtivo());
}
