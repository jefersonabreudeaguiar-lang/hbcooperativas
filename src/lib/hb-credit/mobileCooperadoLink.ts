import { normalizeAuthEmail } from "@/lib/security/appCreator";

/** Vínculos fixos: e-mail de gestão no celular → cooperado (ex.: Orlando). */
const MOBILE_COOPERADO_BY_EMAIL: Record<string, string> = {
  [normalizeAuthEmail("jefersonabreudeaguiar@gmail.com")]: "c_1782263929381_ncp55",
};

export function resolveMobileCooperadoIdFromEmail(email: string | null | undefined): string | undefined {
  if (!email?.trim()) return undefined;
  return MOBILE_COOPERADO_BY_EMAIL[normalizeAuthEmail(email)];
}

export function resolveMobileCooperadoId(profile: {
  email?: string | null;
  mobileCooperadoId?: string | null;
}): string | undefined {
  const fromProfile = profile.mobileCooperadoId?.trim();
  if (fromProfile) return fromProfile;
  return resolveMobileCooperadoIdFromEmail(profile.email);
}

/** Detecta app mobile/PWA pelo User-Agent (server-side). */
export function isMobileCooperativaUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}
