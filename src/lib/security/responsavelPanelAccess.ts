import type { AppData, User, UserRole } from "@/types";
import { isAppCreator, normalizeAuthEmail } from "@/lib/security/appCreator";
import { listMembrosEquipeIncluindoInativos } from "@/services/equipeService";

const BUILTIN_PAINEL_RESPONSAVEL_EMAILS = ["jefersonabreudeaguiar@gmail.com"];

function normalizeRole(role: string): UserRole {
  if (role === "presidente") return "responsavel";
  return role as UserRole;
}

function isStaffRole(role: UserRole): boolean {
  return role === "responsavel" || role === "admin" || role === "tesoureiro";
}

export function isBuiltinPainelResponsavelEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const norm = normalizeAuthEmail(email);
  return BUILTIN_PAINEL_RESPONSAVEL_EMAILS.some((e) => normalizeAuthEmail(e) === norm);
}

/** Quem pode ver o painel da diretoria (desktop e mobile). */
export function canAccessPainelResponsavel(
  user: Pick<User, "id" | "email" | "role" | "cooperadoId" | "cooperativaId" | "active"> | null | undefined,
  data?: AppData | null
): boolean {
  if (!user || user.active === false) return false;

  if (user.cooperadoId?.trim()) return false;

  const role = normalizeRole(user.role);
  if (role === "cooperado" || role === "parceiro" || role === "contador") return false;
  if (!isStaffRole(role)) return false;

  if (isAppCreator(user) || isBuiltinPainelResponsavelEmail(user.email)) return true;

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
export function canAccessPainelResponsavelSession(session: {
  email?: string | null;
  role?: string | null;
  cooperadoId?: string | null;
} | null | undefined): boolean {
  if (!session) return false;
  if (session.cooperadoId?.trim()) return false;

  const role = normalizeRole(session.role ?? "");
  if (role === "cooperado" || role === "parceiro" || role === "contador") return false;
  if (!isStaffRole(role)) return false;

  if (isAppCreator({ email: session.email ?? "" })) return true;
  if (isBuiltinPainelResponsavelEmail(session.email)) return true;

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
