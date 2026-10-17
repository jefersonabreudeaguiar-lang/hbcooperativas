import type { AppData, User } from "@/types";
import { identidadeMostraPainelGestao } from "@/lib/responsavel/responsavelIdentidade";

/** Usuário para menu, permissões e dashboard admin — conta real quando o painel está ativo. */
export function shouldRenderStaffPainelUi(
  accountUser: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active" | "mobileCooperadoId"> | null | undefined,
  data?: AppData | null
): boolean {
  return identidadeMostraPainelGestao({
    accountUser,
    data,
    dataReady: Boolean(data),
  });
}

/** Antes do AppData aquecer — evita cair no painel cooperado com tela vazia no browser. */
export function shouldRenderStaffPainelUiSession(
  accountUser: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active" | "mobileCooperadoId"> | null | undefined,
  data?: AppData | null
): boolean {
  return identidadeMostraPainelGestao({
    accountUser,
    data,
    dataReady: false,
  });
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
