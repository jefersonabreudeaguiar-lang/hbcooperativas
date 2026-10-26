import type { User } from "@/types";
import { isCooperadoMobilePilot } from "@/lib/cooperado/cooperadoMobilePilot";

/** Liga reconstrução incremental — só afeta Jeferson quando `true`. */
export const COOPERADO_JEFERSON_REBUILD_MODE_ON = true;

export type CooperadoJefersonRebuildTab = "inicio" | "entregas" | "precos" | "financeiro";

/**
 * Abas já reimplementadas no piloto. Vazio = cooperado Jeferson vê casca zerada em todas.
 * Promoção oficial: copiar implementação estável e habilitar GA separadamente.
 */
export const COOPERADO_JEFERSON_REBUILD_TABS_HABILITADAS: readonly CooperadoJefersonRebuildTab[] = [];

export function isCooperadoJefersonRebuildPilot(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!COOPERADO_JEFERSON_REBUILD_MODE_ON) return false;
  return isCooperadoMobilePilot(user);
}

export function cooperadoJefersonRebuildTabHabilitada(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!isCooperadoJefersonRebuildPilot(user)) return true;
  return COOPERADO_JEFERSON_REBUILD_TABS_HABILITADAS.includes(tab);
}

/** Conteúdo legado pesado deve ficar desligado quando a aba ainda não foi refeita. */
export function cooperadoJefersonRebuildUsarConteudoLegado(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  return cooperadoJefersonRebuildTabHabilitada(tab, user);
}

export function shouldRenderCooperadoJefersonRebuildShell(
  tab: CooperadoJefersonRebuildTab,
  user: Omit<User, "password"> | null | undefined
): boolean {
  return isCooperadoJefersonRebuildPilot(user) && !cooperadoJefersonRebuildTabHabilitada(tab, user);
}
