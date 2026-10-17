/**
 * Contrato único de identidade da sessão (Etapa 0).
 *
 * Quatro casos:
 * 1. responsável puro — sempre gestão
 * 2. cooperado puro — sempre cooperado
 * 3. perfil duplo (responsável + cooperadoId) — sempre gestão (não há troca de painel)
 * 4. JWT cooperado — sempre app cooperado
 *
 * JWT cooperado no celular/PWA nunca vira menu de gestão — em hipótese alguma.
 */
import type { AppData, User, UserRole } from "@/types";
import {
  canAccessPainelResponsavel,
  canAccessPainelResponsavelSession,
} from "@/lib/security/responsavelPanelAccess";
import { isAppCreator } from "@/lib/security/appCreator";

export const RESPONSAVEL_IDENTIDADE_VERSION = 6;

export type ResponsavelIdentidadeCaso =
  | "none"
  | "parceiro"
  | "contador"
  | "cooperado_puro"
  | "responsavel_puro"
  | "duplo_desktop"
  | "duplo_mobile_cooperado"
  | "duplo_mobile_gestao";

export type ResponsavelIdentidadeModo = "none" | "parceiro" | "contador" | "cooperado" | "gestao";

type AuthSubject = Pick<
  User,
  "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active" | "mobileCooperadoId"
>;

export type ResponsavelIdentidade = {
  caso: ResponsavelIdentidadeCaso;
  modo: ResponsavelIdentidadeModo;
  /** A conta pode operar gestão (papel/email), independente da UI atual. */
  canGestao: boolean;
  /** A sessão atual deve mostrar shell/painel da cooperativa. */
  staffPainelUi: boolean;
  showAdminPainel: boolean;
};

export type EvaluateResponsavelIdentidadeOpts = {
  accountUser?: AuthSubject | null;
  experienceUser?: AuthSubject | null;
  data?: AppData | null;
  dataReady?: boolean;
  /** Injeta viewport — testes. Sem valor, detecta celular/PWA. */
  mobile?: boolean;
  /** Legado — ignorado. Não há troca de painel. */
  preferPainelResponsavel?: boolean;
};

function normalizeRole(role: string): UserRole {
  if (role === "presidente") return "responsavel";
  return role as UserRole;
}

function detectMobileCooperativaApp(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return true;
  if (window.matchMedia("(max-width: 1023px)").matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * No servidor, JWT cooperado puro assume celular (não pisca gestão).
 * Staff (canGestao) assume desktop — se o SSR fingir celular, o hydrate zera a página.
 */
function resolveMobileFlag(
  optsMobile: boolean | undefined,
  jwtCooperado: boolean,
  canGestao: boolean
): boolean {
  if (optsMobile !== undefined) return optsMobile;
  if (typeof window === "undefined") return jwtCooperado && !canGestao;
  return detectMobileCooperativaApp();
}

function temVinculoCooperado(user: AuthSubject | null | undefined): boolean {
  return Boolean(user?.cooperadoId?.trim() || user?.mobileCooperadoId?.trim());
}

/** JWT cooperado nunca abre o painel do responsável — celular ou browser. */
export function cooperadoSessaoNuncaPainelGestao(
  user: AuthSubject | null | undefined
): boolean {
  if (!user) return false;
  if (isAppCreator(user)) return false;
  return normalizeRole(user.role) === "cooperado";
}

/** Celular/PWA: sessão JWT cooperado nunca abre o painel do responsável. */
export function cooperadoSessaoNuncaPainelGestaoMobile(
  user: AuthSubject | null | undefined,
  _mobile?: boolean
): boolean {
  return cooperadoSessaoNuncaPainelGestao(user);
}

function resolveCanGestao(
  account: AuthSubject,
  data: AppData | null | undefined,
  dataReady: boolean
): boolean {
  if (dataReady) return canAccessPainelResponsavel(account, data ?? null);
  return canAccessPainelResponsavelSession(account, data);
}

/**
 * Quem é gestão nesta sessão — única fonte para shell, dashboard, permissões e guards.
 */
export function evaluateResponsavelIdentidade(
  opts: EvaluateResponsavelIdentidadeOpts
): ResponsavelIdentidade {
  const account = opts.accountUser ?? opts.experienceUser ?? null;
  if (!account) {
    return {
      caso: "none",
      modo: "none",
      canGestao: false,
      staffPainelUi: false,
      showAdminPainel: false,
    };
  }

  const dataReady = Boolean(opts.dataReady);
  const sessionRole = normalizeRole(account.role);
  const jwtCooperado = sessionRole === "cooperado";
  const canGestao = resolveCanGestao(account, opts.data, dataReady);
  const vinculoCooperado = temVinculoCooperado(account);
  const mobile = resolveMobileFlag(opts.mobile, jwtCooperado, canGestao);

  if (sessionRole === "parceiro") {
    return {
      caso: "parceiro",
      modo: "parceiro",
      canGestao: false,
      staffPainelUi: false,
      showAdminPainel: false,
    };
  }
  if (sessionRole === "contador" && !canGestao) {
    return {
      caso: "contador",
      modo: "contador",
      canGestao: false,
      staffPainelUi: false,
      showAdminPainel: false,
    };
  }

  /** JWT cooperado: só app do cooperado. Preferência/users[]/builtin não viram gestão. */
  if (cooperadoSessaoNuncaPainelGestao(account)) {
    return {
      caso: canGestao && vinculoCooperado ? "duplo_mobile_cooperado" : "cooperado_puro",
      modo: "cooperado",
      canGestao,
      staffPainelUi: false,
      showAdminPainel: false,
    };
  }

  if (!canGestao) {
    return {
      caso: "cooperado_puro",
      modo: "cooperado",
      canGestao: false,
      staffPainelUi: false,
      showAdminPainel: false,
    };
  }

  const perfilDuplo = canGestao && vinculoCooperado;

  /** Sem troca de painel: gestão (incluindo perfil duplo) fica em gestão. */
  if (canGestao) {
    return {
      caso: perfilDuplo ? (mobile ? "duplo_mobile_gestao" : "duplo_desktop") : "responsavel_puro",
      modo: "gestao",
      canGestao: true,
      staffPainelUi: true,
      showAdminPainel: true,
    };
  }

  return {
    caso: "cooperado_puro",
    modo: "cooperado",
    canGestao,
    staffPainelUi: false,
    showAdminPainel: false,
  };
}

export function identidadeMostraPainelGestao(
  opts: EvaluateResponsavelIdentidadeOpts
): boolean {
  return evaluateResponsavelIdentidade(opts).staffPainelUi;
}
