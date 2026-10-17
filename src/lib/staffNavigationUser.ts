import type { AppData, User } from "@/types";
import { canAccessPainelResponsavel } from "@/lib/security/responsavelPanelAccess";
import { isMobileCooperativaApp } from "@/lib/mobileExperience";
import { preferPainelResponsavelMobile } from "@/lib/mobilePainelPreference";

/** Usuário para menu, permissões e dashboard admin — conta real quando o painel está ativo. */
export function shouldRenderStaffPainelUi(
  accountUser: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active"> | null | undefined,
  data?: AppData | null
): boolean {
  if (!accountUser || !canAccessPainelResponsavel(accountUser, data)) return false;
  if (!isMobileCooperativaApp()) return true;
  return preferPainelResponsavelMobile();
}

export function resolveStaffNavigationUser<T extends Omit<User, "password">>(
  accountUser: T | null | undefined,
  experienceUser: T | null | undefined,
  data?: AppData | null
): T | null | undefined {
  if (!experienceUser) return experienceUser;
  if (accountUser && shouldRenderStaffPainelUi(accountUser, data)) return accountUser;
  return experienceUser;
}
