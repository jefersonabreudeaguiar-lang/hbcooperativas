/**
 * Política de sync só da gestão (responsável / tesoureiro / admin).
 * Referência: baseline/melhor-performance-build-283 (a83214a5).
 *
 * Não importar em fluxos cooperado mobile nem em conferência de notas.
 */
import type { AppData, UserRole } from "@/types";
import type { SyncRunOptions } from "@/services/syncRequest";
import { staffPrecisaHydrateOperacionalPull } from "@/lib/staff/staffOperacionalColdHydrate";
import { staffGestaoEmViewportDesktop } from "@/lib/staff/staffGestaoModoDesktop";

const STAFF_GESTAO_ROLES: UserRole[] = ["responsavel", "tesoureiro", "admin"];

export function isStaffGestaoRole(role: UserRole | string | undefined | null): boolean {
  if (!role) return false;
  return STAFF_GESTAO_ROLES.includes(role as UserRole);
}

/**
 * Abertura / F5.
 * PIX+livro vazios: financeiro_delta (puxa o backup da nuvem, sem push).
 * Aparelho já hidratado: notas_delta.
 */
export function staffResponsavelOpeningSyncRequest(data?: AppData | null): SyncRunOptions {
  if (staffPrecisaHydrateOperacionalPull(data)) {
    return { silent: true, force: true, tier: "financeiro_delta" };
  }
  /** PC já hidratado: shell leve — operacional completo só em «Atualizar». */
  if (staffGestaoEmViewportDesktop()) {
    return { silent: true, tier: "pulse" };
  }
  return { silent: true, tier: "notas_delta" };
}

/**
 * Voltar à aba / idle / online — nunca puxa operacional.
 * O toque em Início acorda o idle (pointerdown) e, com financeiro_delta,
 * reaplicava operacional vazio da nuvem e zerava o responsável.
 * Hydrate frio fica só na abertura (staffResponsavelOpeningSyncRequest).
 */
export function staffResponsavelLifecycleSyncRequest(_data?: AppData | null): SyncRunOptions | undefined {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path === "/notas-pedido" || path.startsWith("/notas-pedido/")) {
    return { silent: true, tier: "notas_delta" };
  }
  return { silent: true, tier: "pulse" };
}
