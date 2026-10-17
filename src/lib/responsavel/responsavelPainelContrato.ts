/**
 * Contrato estável do painel responsável (gestão / browser).
 * Incremente RESPONSAVEL_PAINEL_CONTRATO_VERSION só em mudança intencional de comportamento.
 *
 * Testes: npm run test:responsavel-painel
 */
import type { AppData, User } from "@/types";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
} from "@/lib/security/responsavelPanelAccess";
import {
  shouldRenderStaffPainelUi,
  shouldRenderStaffPainelUiSession,
} from "@/lib/staffNavigationUser";
import { getStaffShellMenusBeforeDataWarm } from "@/permissions";

export const RESPONSAVEL_PAINEL_CONTRATO_VERSION = 1;

/** Rotas mínimas do shell gestão (cold start + warm). Não remover sem bump de contrato. */
export const STAFF_SHELL_MIN_HREFS = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
] as const;

export type ResponsavelPainelAbertura = {
  canGestao: boolean;
  staffPainelUi: boolean;
  /** Dashboard / início gestão — nunca cair no cooperado quando true. */
  showAdminPainel: boolean;
};

type AuthSubject = Pick<
  User,
  "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active"
>;

export function evaluateResponsavelPainelAbertura(opts: {
  accountUser: AuthSubject | null | undefined;
  authSubject: AuthSubject | null | undefined;
  data: AppData | null | undefined;
  dataReady: boolean;
}): ResponsavelPainelAbertura {
  const { accountUser, authSubject, data, dataReady } = opts;
  /** Conta de gestão — perfil duplo pode atrasar `accountUser`; sessão em `authSubject` abre o painel. */
  const gestaoAccount = accountUser ?? authSubject;
  const staffPainelUi = dataReady
    ? Boolean(gestaoAccount && shouldRenderStaffPainelUi(gestaoAccount, data ?? null))
    : Boolean(gestaoAccount && shouldRenderStaffPainelUiSession(gestaoAccount, data));
  const canGestao = dataReady
    ? Boolean(gestaoAccount && canAccessPainelResponsavel(gestaoAccount, data ?? null))
    : Boolean(gestaoAccount && canAccessPainelResponsavelSession(gestaoAccount, data));
  return {
    canGestao,
    staffPainelUi,
    showAdminPainel: canGestao && staffPainelUi,
  };
}

/**
 * Antes do AppData warm: perfil duplo (responsável + cooperadoId) deve usar shell gestão,
 * não o menu cooperado derivado de `user` experiência.
 */
export function shouldPrioritizeStaffColdShell(
  accountUser: AuthSubject | null | undefined,
  appDataWarm: boolean
): boolean {
  if (appDataWarm || !accountUser) return false;
  return shouldRenderStaffPainelUiSession(accountUser);
}

export function staffShellMenusBeforeDataWarm(accountUser: AuthSubject) {
  return getStaffShellMenusBeforeDataWarm(accountUser);
}

/** Validação usada em testes de regressão — falha se o menu cold perder rotas âncora. */
export function assertStaffColdShellMenusValid(
  accountUser: AuthSubject,
  menus: ReturnType<typeof getStaffShellMenusBeforeDataWarm>
): void {
  const hrefs = new Set(menus.desktopMenu.map((i) => i.href));
  for (const required of STAFF_SHELL_MIN_HREFS) {
    if (!hrefs.has(required)) {
      throw new Error(
        `responsavelPainelContrato: falta ${required} no menu desktop (contrato v${RESPONSAVEL_PAINEL_CONTRATO_VERSION})`
      );
    }
  }
  if (menus.desktopMenu.length < 3) {
    throw new Error("responsavelPainelContrato: menu desktop gestão vazio no cold start");
  }
}
