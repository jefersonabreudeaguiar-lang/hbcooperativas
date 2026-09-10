import type { UserRole } from "@/types";
import type { SessionClaims } from "@/lib/security/jwt";

/** Perfis de equipe — cooperativa ou plataforma. */
export const STAFF_ROLES: readonly UserRole[] = [
  "responsavel",
  "tesoureiro",
  "contador",
  "admin",
] as const;

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

/** MFA TOTP desligado no app — colunas SQL podem permanecer no banco. */
export function isStaffMfaFeatureEnabled(): boolean {
  return false;
}

/** Fail-closed: só exige MFA quando feature + env ligados. */
export function isStaffMfaEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isStaffMfaFeatureEnabled()) return false;
  const raw = env.HB_STAFF_MFA_REQUIRED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isStaffMfaVerified(session: SessionClaims): boolean {
  return session.mfaVerified === true;
}

/**
 * Bloqueia staff sem MFA quando HB_STAFF_MFA_REQUIRED=true.
 * Cooperado/parceiro não são afetados.
 */
export function staffMfaDeniedResponse(
  session: SessionClaims | null,
  enforced: boolean,
  env: NodeJS.ProcessEnv = process.env
): { denied: true; message: string } | null {
  if (!isStaffMfaFeatureEnabled()) return null;
  if (!enforced || !session || session.mfaVerified) return null;
  if (!isStaffRole(session.role)) return null;
  const policyRequired = isStaffMfaEnforced(env);
  const accountTotp = session.totpEnabled === true;
  if (!policyRequired && !accountTotp) return null;
  return {
    denied: true,
    message: accountTotp
      ? "Informe o código do autenticador para continuar."
      : "Autenticação em duas etapas obrigatória para equipe. Configure MFA.",
  };
}
