/**
 * Se o cooperado caiu no painel do responsável, limpa a preferência e reabre o app dele.
 */
import type { User } from "@/types";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import {
  PAINEL_RESPONSAVEL_MOBILE_KEY,
  preferPainelResponsavelMobile,
  setPreferPainelResponsavelMobile,
} from "@/lib/mobilePainelPreference";
import { isGestaoOnlyRoute } from "@/lib/security/responsavelPanelAccess";

const RESET_DONE_PREFIX = "hb-coop-sair-gestao-reset:";

function normalizeRole(role: string): string {
  if (role === "presidente") return "responsavel";
  return role;
}

function resetDoneKey(userId: string): string {
  return `${RESET_DONE_PREFIX}${userId}:b${APP_BUILD_VERSION}`;
}

export function cooperadoPrecisaResetAposVazamentoPainelGestao(
  user: Pick<User, "id" | "role"> | null | undefined,
  pathname?: string
): boolean {
  if (!user || normalizeRole(user.role) !== "cooperado") return false;
  if (typeof window === "undefined") return false;
  if (!isMobileCooperativaApp()) return false;
  const path = pathname ?? window.location.pathname;
  return preferPainelResponsavelMobile() || isGestaoOnlyRoute(path);
}

/**
 * 1× por cooperado/build: tira o modo responsável e recarrega o Início cooperado.
 * Não apaga sessão nem ficha.
 */
export function resetCooperadoAposVazamentoPainelGestao(
  user: Pick<User, "id" | "role"> | null | undefined,
  pathname?: string
): boolean {
  if (!cooperadoPrecisaResetAposVazamentoPainelGestao(user, pathname)) {
    if (user && normalizeRole(user.role) === "cooperado") {
      setPreferPainelResponsavelMobile(false);
    }
    return false;
  }

  try {
    const key = resetDoneKey(user!.id);
    if (sessionStorage.getItem(key) === "1") {
      setPreferPainelResponsavelMobile(false);
      return false;
    }
    sessionStorage.setItem(key, "1");
    sessionStorage.removeItem(PAINEL_RESPONSAVEL_MOBILE_KEY);
  } catch {
    setPreferPainelResponsavelMobile(false);
    return false;
  }

  setPreferPainelResponsavelMobile(false);
  if (typeof window === "undefined") return false;
  window.location.replace("/dashboard");
  return true;
}
