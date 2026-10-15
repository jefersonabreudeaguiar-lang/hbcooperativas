/**
 * Política de sync só da gestão (responsável / tesoureiro / admin).
 * Referência: baseline/melhor-performance-build-283 (a83214a5).
 *
 * Não importar em fluxos cooperado mobile nem em conferência de notas.
 */
import type { UserRole } from "@/types";
import type { SyncRunOptions } from "@/services/syncRequest";

const STAFF_GESTAO_ROLES: UserRole[] = ["responsavel", "tesoureiro", "admin"];

export function isStaffGestaoRole(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return STAFF_GESTAO_ROLES.includes(role as UserRole);
}

/** Abertura pós-login — baseline 283: notas_delta (fila Conferir rápida; sem operacional_full). */
export function staffResponsavelOpeningSyncRequest(): SyncRunOptions {
  return { silent: true, tier: "notas_delta" };
}

/**
 * Voltar à aba / idle / online — deltas leves (não operacional_full).
 * Em notas-pedido: notas_delta; demais rotas: financeiro_delta (pagamentos/ficha).
 */
export function staffResponsavelLifecycleSyncRequest(): SyncRunOptions | undefined {
  const path =
    typeof window !== "undefined" ? window.location.pathname : "";
  if (path === "/notas-pedido" || path.startsWith("/notas-pedido/")) {
    return { silent: true, tier: "notas_delta" };
  }
  return { silent: true, tier: "financeiro_delta" };
}
