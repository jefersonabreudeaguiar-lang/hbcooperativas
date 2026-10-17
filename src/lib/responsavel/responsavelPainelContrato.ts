/**
 * Contrato estável do painel responsável (gestão / browser).
 * Incremente RESPONSAVEL_PAINEL_CONTRATO_VERSION só em mudança intencional de comportamento.
 *
 * Testes: npm run test:responsavel-painel
 */
import type { AppData, User } from "@/types";
import {
  evaluateResponsavelIdentidade,
  type ResponsavelIdentidadeModo,
} from "@/lib/responsavel/responsavelIdentidade";
import { getStaffShellMenusBeforeDataWarm } from "@/permissions";

export const RESPONSAVEL_PAINEL_CONTRATO_VERSION = 3;

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
  modo: ResponsavelIdentidadeModo;
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
  mobile?: boolean;
  preferPainelResponsavel?: boolean;
}): ResponsavelPainelAbertura {
  const { accountUser, authSubject, data, dataReady } = opts;
  const identidade = evaluateResponsavelIdentidade({
    accountUser: accountUser ?? authSubject,
    experienceUser: authSubject,
    data,
    dataReady,
    mobile: opts.mobile,
    preferPainelResponsavel: opts.preferPainelResponsavel,
  });

  return {
    canGestao: identidade.canGestao,
    staffPainelUi: identidade.staffPainelUi,
    showAdminPainel: identidade.showAdminPainel,
    modo: identidade.modo,
  };
}

/**
 * Antes do AppData warm: perfil duplo (responsável + cooperadoId) deve usar shell gestão,
 * não o menu cooperado derivado de `user` experiência.
 */
export function shouldPrioritizeStaffColdShell(
  gestaoAccount: AuthSubject | null | undefined,
  appDataWarm: boolean,
  data?: AppData | null
): boolean {
  if (appDataWarm || !gestaoAccount) return false;
  return evaluateResponsavelIdentidade({
    accountUser: gestaoAccount,
    data,
    dataReady: false,
  }).staffPainelUi;
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
