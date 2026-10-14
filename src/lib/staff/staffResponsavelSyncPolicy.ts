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

/** Abertura pós-login — 283 usava notas_delta; aqui financeiro_delta puxa pagamentos sem bidirectional_full (fila Pagar). */
export function staffResponsavelOpeningSyncRequest(): SyncRunOptions {
  return { silent: true, tier: "financeiro_delta" };
}

/** Voltar à aba / idle / online — igual ao 283: runSync padrão (operacional_full na gestão). */
export function staffResponsavelLifecycleSyncRequest(): SyncRunOptions | undefined {
  return undefined;
}
