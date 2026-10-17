import type { AppData, User, UserRole } from "@/types";
import { isAppCreator, normalizeAuthEmail } from "@/lib/security/appCreator";
import {
  listContadoresEquipe,
  listMembrosEquipeIncluindoInativos,
} from "@/services/equipeService";
/** CNPJ cadastrado nesta instalação. */
export const CNPJ_PAINEL_RESPONSAVEL_RESTRITO = "62351750000165";

/** Responsável principal — concede acesso à equipe e ao contador. */
export const EMAIL_PAINEL_RESPONSAVEL_CNPJ_RESTRITO = "invisium3@gmail.com";

const BUILTIN_PAINEL_RESPONSAVEL_EMAILS: string[] = [];

function normalizeRole(role: string): UserRole {
  if (role === "presidente") return "responsavel";
  return role as UserRole;
}

function isStaffRole(role: UserRole): boolean {
  return role === "responsavel" || role === "admin" || role === "tesoureiro";
}

function jwtRoleCooperado(
  user: Pick<User, "role"> | { role?: string | null } | null | undefined
): boolean {
  return normalizeRole(String(user?.role ?? "")) === "cooperado";
}

function emailNorm(email: string | null | undefined): string {
  return normalizeAuthEmail(email ?? "");
}

/** Contador a quem o responsável principal passou acesso (Equipe). */
function isContadorEquipeConcedido(
  user: Pick<User, "id" | "email" | "role" | "cooperativaId" | "active"> | { id?: string | null; email?: string | null; role?: string | null; cooperativaId?: string | null; active?: boolean },
  data?: AppData | null
): boolean {
  if (user.active === false) return false;
  if (normalizeRole(String(user.role ?? "")) !== "contador") return false;
  if (!data) return true;
  const coopId = user.cooperativaId?.trim();
  if (!coopId) return false;
  const norm = emailNorm(user.email ?? "");
  return listContadoresEquipe(data, coopId).some(
    (m) =>
      m.active !== false &&
      (m.id === user.id || emailNorm(m.email) === norm)
  );
}

/** Sessão persistida pode ter role cooperado (legado); users[] local traz o papel staff real. */
export function resolveAuthoritativePanelRole(
  user: Pick<User, "id" | "email" | "role">,
  data?: AppData | null
): UserRole {
  const direct = normalizeRole(user.role);
  /** JWT cooperado não vira gestão por users[] — nem no browser. */
  if (direct === "cooperado" && !isAppCreator(user)) return "cooperado";
  if (!data || direct !== "cooperado") return direct;
  const emailNorm = normalizeAuthEmail(user.email);
  const local =
    data.users.find((u) => u.active && u.id === user.id) ??
    data.users.find((u) => u.active && normalizeAuthEmail(u.email) === emailNorm);
  if (!local) return direct;
  return normalizeRole(local.role);
}

export function isBuiltinPainelResponsavelEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const norm = normalizeAuthEmail(email);
  return BUILTIN_PAINEL_RESPONSAVEL_EMAILS.some((e) => normalizeAuthEmail(e) === norm);
}

/** Quem pode ver o painel da diretoria (desktop e mobile). */
export function canAccessPainelResponsavel(
  user: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "cooperativaCnpj" | "active"> | null | undefined,
  data?: AppData | null
): boolean {
  if (!user || user.active === false) return false;

  /** Cooperado (JWT) não entra no painel — browser ou celular. Só o criador. */
  if (jwtRoleCooperado(user) && !isAppCreator(user)) return false;

  if (isAppCreator(user)) return true;

  const role = resolveAuthoritativePanelRole(user, data);
  if (role === "cooperado" || role === "parceiro") return false;
  if (role === "contador") return isContadorEquipeConcedido(user, data);
  if (!isStaffRole(role)) return false;

  /** Cooperado puro — não entra no painel. Responsável/tesoureiro podem ter cooperadoId (perfil duplo). */
  if (user.cooperadoId?.trim() && role !== "responsavel" && role !== "tesoureiro") {
    return false;
  }

  /** Mesma regra de canAccessPainelResponsavelSession — não exige equipe local carregada. */
  if (role === "responsavel" || role === "tesoureiro") return true;
  if (role === "admin") return isAppCreator(user);

  if (data && user.cooperativaId) {
    const emailNorm = normalizeAuthEmail(user.email);
    return listMembrosEquipeIncluindoInativos(data, user.cooperativaId).some(
      (m) => m.active !== false && normalizeAuthEmail(m.email) === emailNorm
    );
  }

  return false;
}

/** Resolve cooperadoId para UI de cooperado quando o painel da diretoria não é permitido. */
export function resolveCooperadoExperienceId(
  user: Pick<User, "email" | "cooperadoId" | "mobileCooperadoId">
): string | undefined {
  const direct = user.cooperadoId?.trim();
  if (direct) return direct;
  const mapped = user.mobileCooperadoId?.trim();
  if (mapped) return mapped;
  return undefined;
}

export function shouldUseCooperadoExperience(
  user: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active" | "mobileCooperadoId"> | null | undefined,
  data?: AppData | null
): boolean {
  if (!user) return false;
  if (canAccessPainelResponsavel(user, data)) return false;
  return Boolean(resolveCooperadoExperienceId(user)) || normalizeRole(user.role) === "cooperado";
}

/** Checagem server-side (JWT / app_users) — sem depender do AppData local. */
export function canAccessPainelResponsavelSession(
  session: {
    email?: string | null;
    role?: string | null;
    cooperadoId?: string | null;
    id?: string | null;
    cooperativaId?: string | null;
    active?: boolean;
  } | null
    | undefined,
  data?: AppData | null
): boolean {
  if (!session) return false;

  if (jwtRoleCooperado(session) && !isAppCreator({ email: session.email ?? "" })) {
    return false;
  }

  if (isAppCreator({ email: session.email ?? "" })) return true;

  if (data) {
    if (
      canAccessPainelResponsavel(
        session as Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active">,
        data
      )
    ) {
      return true;
    }
  }

  const role = normalizeRole(session.role ?? "");
  if (role === "contador") return true;
  if (role === "cooperado" || role === "parceiro") return false;
  if (!isStaffRole(role)) return false;

  if (session.cooperadoId?.trim() && role !== "responsavel" && role !== "tesoureiro") {
    return false;
  }

  if (role === "responsavel" || role === "tesoureiro") return true;
  if (role === "admin") return isAppCreator({ email: session.email ?? "" });

  return false;
}

const GESTAO_ONLY_PREFIXES = [
  "/cooperados",
  "/votacoes",
  "/fechamento-mensal",
  "/contratos",
  "/cotas",
  "/descontos",
  "/financeiro",
  "/propriedades",
  "/veiculos",
  "/contador",
];

export function isGestaoOnlyRoute(pathname: string): boolean {
  if (pathname === "/meu-perfil") return true;
  return GESTAO_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
