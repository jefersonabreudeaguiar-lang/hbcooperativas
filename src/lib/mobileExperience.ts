import type { User, UserRole } from "@/types";
import { normalizeAuthEmail } from "@/lib/security/appCreator";
import { isCooperadoAppUser, normalizeUserRole } from "@/permissions";

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

/** Vínculos fixos: e-mail de gestão no celular → cooperado (ex.: Orlando). */
const MOBILE_COOPERADO_BY_EMAIL: Record<string, string> = {
  [normalizeAuthEmail("jefersonabreudeaguiar@gmail.com")]: "c_1782263929381_ncp55",
};

export function resolveMobileCooperadoId(user: Pick<User, "email" | "mobileCooperadoId">): string | undefined {
  const fromProfile = user.mobileCooperadoId?.trim();
  if (fromProfile) return fromProfile;
  const email = normalizeAuthEmail(user.email ?? "");
  return MOBILE_COOPERADO_BY_EMAIL[email];
}

/** Papel e cooperadoId usados na UI — no celular, responsável pode operar como cooperado vinculado. */
export function resolveExperienceUser<T extends Omit<User, "password">>(
  user: T | null | undefined
): T | null {
  if (!user) return null;
  if (!isMobileCooperativaApp()) return user;
  if (isCooperadoAppUser(user)) return { ...user, role: "cooperado" as UserRole };

  const role = normalizeUserRole(user.role);
  if (role !== "responsavel" && role !== "tesoureiro" && role !== "admin") {
    return user;
  }

  const mobileCooperadoId = resolveMobileCooperadoId(user);
  if (!mobileCooperadoId) return user;

  return {
    ...user,
    role: "cooperado",
    cooperadoId: mobileCooperadoId,
  };
}
