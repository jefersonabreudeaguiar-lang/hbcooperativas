"use client";

import { useCooperadoTabPanelContext } from "@/lib/performance/cooperadoTabPanelContext";
import {
  isCooperadoBottomTabPath,
  type CooperadoBottomTabHref,
} from "@/lib/performance/cooperadoBottomTabRoutes";
import { isCooperadoMobileTabKeepAliveEnabled } from "@/lib/performance/cooperadoMobileTabKeepAlive";

/**
 * RQL 8.6 P0 — painel montado pelo keep-alive só deve rodar efeitos pesados quando visível.
 * Fora do keep-alive (desktop / flag off), retorna true.
 */
export function useCooperadoTabPanelActive(panelHref: CooperadoBottomTabHref): boolean {
  const ctx = useCooperadoTabPanelContext();
  if (!isCooperadoMobileTabKeepAliveEnabled()) return true;
  if (!ctx) return true;
  if (!isCooperadoBottomTabPath(panelHref)) return true;
  return ctx.activeHref === panelHref;
}
