import type { AppData, User, UserRole } from "@/types";
import { isCooperadoAppUser, normalizeUserRole } from "@/permissions";
import {
  resolveMobileCooperadoId,
  resolveMobileCooperadoIdFromEmail,
} from "@/lib/hb-credit/mobileCooperadoLink";
import { resolveCooperadoExperienceId } from "@/lib/security/responsavelPanelAccess";
import { evaluateResponsavelIdentidade } from "@/lib/responsavel/responsavelIdentidade";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

export { resolveMobileCooperadoId, resolveMobileCooperadoIdFromEmail };

function isAppStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Celular / PWA — experiência cooperado; desktop — papel real (ex.: responsável). */
export function isMobileCooperativaApp(): boolean {
  if (typeof window === "undefined") return false;
  if (isAppStandaloneMode()) return true;
  if (window.matchMedia("(max-width: 1023px)").matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function canonicalCooperadoIdForExperience<T extends Omit<User, "password">>(
  user: T,
  cooperadoId: string,
  data?: AppData | null
): string {
  if (!data) return cooperadoId;
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return cooperadoId;
  return resolverCooperadoIdCanonico(data, cooperadoId, coopId);
}

function asCooperadoExperience<T extends Omit<User, "password">>(
  user: T,
  cooperadoId: string,
  data?: AppData | null
): T {
  const canon = canonicalCooperadoIdForExperience(user, cooperadoId, data);
  return {
    ...user,
    role: "cooperado",
    cooperadoId: canon,
  };
}

/** Papel e cooperadoId usados na UI — cooperado sempre cooperado; gestão só para quem foi autorizado. */
export function resolveExperienceUser<T extends Omit<User, "password">>(
  user: T | null | undefined,
  data?: AppData | null
): T | null {
  if (!user) return null;

  const mobile = isMobileCooperativaApp();
  const identidade = evaluateResponsavelIdentidade({
    accountUser: user,
    data,
    dataReady: Boolean(data),
    mobile,
  });

  if (identidade.staffPainelUi) {
    return user;
  }

  if (identidade.modo === "cooperado" || isCooperadoAppUser(user)) {
    const cooperadoId =
      resolveCooperadoExperienceId(user) ??
      user.cooperadoId ??
      resolveMobileCooperadoId(user);
    return cooperadoId
      ? asCooperadoExperience(user, cooperadoId, data)
      : { ...user, role: "cooperado" as UserRole };
  }

  if (identidade.modo === "parceiro" || identidade.modo === "contador") {
    return user;
  }

  const role = normalizeUserRole(user.role);
  if (mobile && (role === "responsavel" || role === "tesoureiro" || role === "admin")) {
    const mobileCooperadoId = resolveMobileCooperadoId(user);
    if (mobileCooperadoId) return asCooperadoExperience(user, mobileCooperadoId, data);
  }

  return user;
}
