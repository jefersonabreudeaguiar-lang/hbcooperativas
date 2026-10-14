import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";

const INTRO_KEY_PREFIX = "hb.coop.pilotJeferson.hbCreditHubIntro.v1:";

/** Piloto Jeferson — UX e performance dedicados em HB Créditos (cooperado mobile). */
export function isCooperadoMobilePilotHbCreditUi(
  user: Omit<User, "password"> | null | undefined
): boolean {
  return Boolean(user && user.role === "cooperado" && isCooperadoMobileGaPromoted(user));
}

export function cooperadoPilotHbCreditHubIntroDone(userId: string): boolean {
  if (typeof localStorage === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(INTRO_KEY_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function markCooperadoPilotHbCreditHubIntroDone(userId: string): void {
  if (typeof localStorage === "undefined" || !userId) return;
  try {
    localStorage.setItem(INTRO_KEY_PREFIX + userId, "1");
  } catch {
    /* quota */
  }
}

/** Abertura Minha Conta: limite da ficha/entregas na hora (GA — evita saldo zerado). */
export function cooperadoMobilePilotHbCreditDeferLimiteSyncOnOpen(): boolean {
  return false;
}
