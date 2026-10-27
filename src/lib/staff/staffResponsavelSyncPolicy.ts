/**
 * Política de sync só da gestão (responsável / tesoureiro / admin).
 * Referência: baseline/melhor-performance-build-283 (a83214a5).
 *
 * Não importar em fluxos cooperado mobile nem em conferência de notas.
 */
import type { AppData, UserRole } from "@/types";
import type { SyncRunOptions } from "@/services/syncRequest";
import {
  staffCooperadosCadastroAusente,
  staffGestaoFaltaFichaOperacionalNoEscopo,
  staffPrecisaHydrateOperacionalPull,
} from "@/lib/staff/staffOperacionalColdHydrate";
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
export function staffResponsavelOpeningSyncRequest(
  data?: AppData | null,
  coopId?: string
): SyncRunOptions {
  /** Anônimo / cache limpo: notas na fila sem cadastro → nomes e totais zerados. */
  if (staffCooperadosCadastroAusente(data, coopId)) {
    return { silent: true, force: true, tier: "notas_delta" };
  }
  if (staffPrecisaHydrateOperacionalPull(data, coopId)) {
    return { silent: true, force: true, tier: "financeiro_delta" };
  }
  /** PC hidratado: notas_delta expande pull quando necessário — sem pulse vazio na abertura. */
  if (staffGestaoEmViewportDesktop()) {
    return { silent: true, tier: "notas_delta" };
  }
  return { silent: true, tier: "notas_delta" };
}

/** Segunda/terceira passada da abertura — cooperados e ficha antes de fechar a sessão. */
export function staffResponsavelHydrateFollowUpSyncRequest(
  data?: AppData | null,
  coopId?: string
): SyncRunOptions | undefined {
  if (!coopId) return undefined;
  if (staffCooperadosCadastroAusente(data, coopId)) {
    return { silent: true, force: true, eventDriven: true, tier: "notas_delta" };
  }
  if (staffGestaoFaltaFichaOperacionalNoEscopo(data, coopId)) {
    return { silent: true, force: true, eventDriven: true, tier: "financeiro_delta" };
  }
  if (staffPrecisaHydrateOperacionalPull(data, coopId)) {
    return { silent: true, force: true, eventDriven: true, tier: "financeiro_delta" };
  }
  return undefined;
}

/** Passada tardia: mesmo plano do Atualizar, sem spinner pesado na abertura. */
export function staffResponsavelForceCloudHydrateSyncRequest(): SyncRunOptions {
  return { silent: true, force: true, userInitiated: true, tier: "operacional_full" };
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
