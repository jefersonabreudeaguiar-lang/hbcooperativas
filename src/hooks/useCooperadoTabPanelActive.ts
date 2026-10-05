"use client";

import { useCooperadoTabPanelContext } from "@/lib/performance/cooperadoTabPanelContext";
import {
  isCooperadoBottomTabPath,
  type CooperadoBottomTabHref,
} from "@/lib/performance/cooperadoBottomTabRoutes";
import { isCooperadoMobileTabKeepAliveEnabled } from "@/lib/performance/cooperadoMobileTabKeepAlive";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";
import { isStaffMobileTabKeepAliveEnabled } from "@/lib/performance/staffMobileTabKeepAlive";

/**
 * RQL 8.6 / U4 — painel em keep-alive só roda efeitos pesados quando a aba está visível.
 * Fora do keep-alive (desktop / flag off), retorna true.
 */
export function useCooperadoTabPanelActive(panelHref: CooperadoBottomTabHref | string): boolean {
  const ctx = useCooperadoTabPanelContext();
  const cooperadoTab = isCooperadoBottomTabPath(panelHref);
  const staffTab = isStaffBottomTabPath(panelHref);
  const keepAliveOn =
    (cooperadoTab && isCooperadoMobileTabKeepAliveEnabled()) ||
    (staffTab && isStaffMobileTabKeepAliveEnabled());
  if (!keepAliveOn) return true;
  if (!ctx) return true;
  if (!cooperadoTab && !staffTab) return true;
  if (ctx.activeHref === panelHref) return true;
  if (staffTab && staffBottomTabCacheKey(ctx.activeHref) === staffBottomTabCacheKey(panelHref)) {
    return true;
  }
  return false;
}
