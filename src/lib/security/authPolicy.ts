import type { UserRole } from "@/types";

/** Perfis permitidos no cadastro público (/api/auth/register). */
export const PUBLIC_REGISTER_ROLES: UserRole[] = ["cooperado", "responsavel", "parceiro"];

/** Perfis permitidos na primeira sincronização na nuvem (/api/auth/provision). */
export const PROVISION_NEW_USER_ROLES: UserRole[] = [
  "cooperado",
  "responsavel",
  "parceiro",
  "contador",
];

export function isPublicRegisterRole(role: UserRole): boolean {
  return PUBLIC_REGISTER_ROLES.includes(role);
}

export function isProvisionNewUserRole(role: UserRole): boolean {
  return PROVISION_NEW_USER_ROLES.includes(role);
}
