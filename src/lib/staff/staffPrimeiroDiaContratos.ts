import type { AppData } from "@/types";
import { getInstituicoesCatalogo } from "@/services/catalogoContratosService";
import { isStaffGestaoRole } from "@/lib/performance/cooperadoColdStart";
import { normalizeCnpj } from "@/utils/cooperativa";

const SEEN_PREFIX = "hb-staff-primeiro-dia-contratos:";

export const STAFF_PRIMEIRO_DIA_CONTRATOS_TITULO = "Primeiro dia: cadastre o primeiro contrato";
export const STAFF_PRIMEIRO_DIA_CONTRATOS_TEXTO =
  "Sem instituição, o cooperado ainda não consegue entregar. Cadastre a escola ou o comprador e depois os produtos com preço.";

export function isStaffPrimeiroDiaContratosVazio(opts: {
  role?: string;
  coopId?: string | null;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (!opts.warm || !opts.data || !opts.coopId) return false;
  if (!isStaffGestaoRole(opts.role)) return false;
  return getInstituicoesCatalogo(opts.data, opts.coopId).length === 0;
}

export function shouldRedirectStaffPrimeiroDiaContratos(opts: {
  role?: string;
  coopId?: string | null;
  pathname: string;
  data: AppData | null;
  warm: boolean;
}): boolean {
  if (opts.pathname.startsWith("/contratos")) return false;
  return isStaffPrimeiroDiaContratosVazio(opts);
}

export function staffPrimeiroDiaContratosSeenKey(cnpj: string): string {
  return `${SEEN_PREFIX}${normalizeCnpj(cnpj)}`;
}

export function hasStaffPrimeiroDiaContratosBeenSeen(cnpj: string): boolean {
  if (typeof window === "undefined") return true;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return true;
  try {
    return sessionStorage.getItem(staffPrimeiroDiaContratosSeenKey(digits)) === "1";
  } catch {
    return true;
  }
}

export function markStaffPrimeiroDiaContratosSeen(cnpj: string): void {
  if (typeof window === "undefined") return;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  try {
    sessionStorage.setItem(staffPrimeiroDiaContratosSeenKey(digits), "1");
  } catch {
    /* private */
  }
}
