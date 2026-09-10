import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { SessionClaims } from "@/lib/security/jwt";
import { isStaffRole } from "@/lib/security/staffAccessPolicy";

export type StaffRegistrationDecision =
  | { allowed: true; asPrincipal: boolean }
  | { allowed: false; error: string; code: string };

const STAFF_MANAGEMENT_ROLES: UserRole[] = ["responsavel", "tesoureiro"];
const EQUIPE_PROVISION_ROLES: UserRole[] = ["responsavel", "tesoureiro", "contador"];

export function isStaffManagementRole(role: UserRole | string): boolean {
  return STAFF_MANAGEMENT_ROLES.includes(role as UserRole);
}

export function isEquipeProvisionRole(role: UserRole | string): boolean {
  return EQUIPE_PROVISION_ROLES.includes(role as UserRole);
}

export async function cooperativaExistsByCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<boolean> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  const { data, error } = await supabase
    .from("cooperativas")
    .select("id")
    .eq("cnpj", digits)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.id);
}

export async function countActiveStaffForCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<number> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return 0;
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_cnpj", digits)
    .eq("active", true)
    .in("role", ["responsavel", "tesoureiro"]);
  if (error) return 0;
  return count ?? 0;
}

/** Bloqueia auto-cadastro de responsável/tesoureiro em CNPJ que já tem equipe. */
export async function evaluatePublicStaffRegistration(
  supabase: SupabaseClient,
  role: UserRole,
  cooperativaCnpj?: string | null
): Promise<StaffRegistrationDecision> {
  if (!isStaffRole(role)) {
    return { allowed: true, asPrincipal: false };
  }

  const digits = cooperativaCnpj ? normalizeCnpj(cooperativaCnpj) : "";
  if (digits.length !== 14) {
    return {
      allowed: false,
      error: "Informe o CNPJ da cooperativa para cadastro de equipe.",
      code: "STAFF_CNPJ_REQUIRED",
    };
  }

  const coopExists = await cooperativaExistsByCnpj(supabase, digits);
  if (!coopExists) {
    return {
      allowed: false,
      error: "Cadastre a cooperativa antes de criar o acesso de responsável.",
      code: "STAFF_COOP_MISSING",
    };
  }

  const staffCount = await countActiveStaffForCnpj(supabase, digits);
  if (staffCount > 0) {
    return {
      allowed: false,
      error:
        "Este CNPJ já possui responsável cadastrado. Peça ao responsável principal para adicioná-lo em Perfil da cooperativa → Equipe e acessos.",
      code: "STAFF_ALREADY_EXISTS",
    };
  }

  return { allowed: true, asPrincipal: true };
}

export function canSessionManageEquipe(session: SessionClaims | null | undefined): boolean {
  if (!session) return false;
  if (session.role === "tesoureiro") return true;
  if (session.role === "responsavel" && session.responsavelPrincipal === true) return true;
  return false;
}

export function canSessionProvisionStaffForCnpj(
  session: SessionClaims | null | undefined,
  cnpj: string
): boolean {
  if (!canSessionManageEquipe(session)) return false;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  const sessionCnpj = session?.cooperativaCnpj ? normalizeCnpj(session.cooperativaCnpj) : "";
  if (session?.role === "admin") return true;
  return sessionCnpj === digits;
}
