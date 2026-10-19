/**
 * Troca de responsável: a memória do painel anterior não pode ficar para o próximo CNPJ.
 */
import { normalizeCnpj } from "@/utils/cooperativa";
import { isStaffGestaoRole } from "@/lib/staff/staffResponsavelSyncPolicy";

export function shouldFlushAppDataMemoryOnTenantChange(prevCnpj: string, nextCnpj: string): boolean {
  const prev = normalizeCnpj(prevCnpj);
  const next = normalizeCnpj(nextCnpj);
  if (prev.length === 14 && next.length === 14) return prev !== next;
  return prev.length === 14 && next.length !== 14;
}

export function shouldAdoptStaffPersistHint(role: string | undefined, nextCnpj: string): boolean {
  return isStaffGestaoRole(role) && normalizeCnpj(nextCnpj).length === 14;
}
