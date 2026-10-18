/**
 * Política de sync só da gestão (responsável / tesoureiro / admin).
 * Referência: baseline/melhor-performance-build-283 (a83214a5).
 *
 * Não importar em fluxos cooperado mobile nem em conferência de notas.
 */
import type { AppData, UserRole } from "@/types";
import type { SyncRunOptions } from "@/services/syncRequest";
import { staffPrecisaHydrateOperacionalPull } from "@/lib/staff/staffOperacionalColdHydrate";

const STAFF_GESTAO_ROLES: UserRole[] = ["responsavel", "tesoureiro", "admin"];

export function isStaffGestaoRole(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return STAFF_GESTAO_ROLES.includes(role as UserRole);
}

/**
 * Abertura pós-login.
 * Cache limpo / PIX+livro vazios: financeiro_delta forçado (o pull staff
 * expande para operacional+notas+contratos, sem push).
 * Aparelho já hidratado: notas_delta (baseline 283).
 */
export function staffResponsavelOpeningSyncRequest(data?: AppData | null): SyncRunOptions {
  if (staffPrecisaHydrateOperacionalPull(data)) {
    return { silent: true, force: true, tier: "financeiro_delta" };
  }
  return { silent: true, tier: "notas_delta" };
}

/**
 * Voltar à aba / idle / online.
 * A frio: mesmo hydrate (não ficar em notas_delta no Conferir).
 * Quente: notas-pedido = notas_delta; demais = financeiro_delta.
 */
export function staffResponsavelLifecycleSyncRequest(data?: AppData | null): SyncRunOptions | undefined {
  if (staffPrecisaHydrateOperacionalPull(data)) {
    return { silent: true, force: true, tier: "financeiro_delta" };
  }
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path === "/notas-pedido" || path.startsWith("/notas-pedido/")) {
    return { silent: true, tier: "notas_delta" };
  }
  return { silent: true, tier: "financeiro_delta" };
}
