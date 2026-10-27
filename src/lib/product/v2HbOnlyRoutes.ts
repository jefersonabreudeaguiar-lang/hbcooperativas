import { normalizeUserRole } from "@/permissions";
import { isV2HbOnlyClient } from "@/lib/product/v2HbOnly";

const COOPERADO_PREFIXES = ["/dashboard", "/minha-conta-coop", "/meu-cadastro", "/baixar-app"];

const STAFF_PREFIXES = ["/conta-coop", "/cooperados", "/meu-perfil", "/baixar-app"];

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isV2StaffProductRole(role: string): boolean {
  const r = normalizeUserRole(role);
  return r === "responsavel" || r === "tesoureiro";
}

/** Rotas que cooperado / responsável podem abrir com V2 no app oficial. */
export function isPathAllowedInV2HbOnly(pathname: string, role: string): boolean {
  if (!isV2HbOnlyClient()) return true;
  const path = (pathname || "/").split("?")[0] || "/";
  const r = normalizeUserRole(role);
  if (r === "cooperado") {
    return COOPERADO_PREFIXES.some((p) => pathMatchesPrefix(path, p));
  }
  if (isV2StaffProductRole(r)) {
    return STAFF_PREFIXES.some((p) => pathMatchesPrefix(path, p));
  }
  return true;
}
