import { isStaffBottomTabPath, staffBottomTabCacheKey } from "@/lib/performance/staffBottomTabRoutes";
import { staffGestaoUsaNavegacaoOtimista } from "@/lib/performance/staffDesktopNavPolicy";
import { setStaffOptimisticTab } from "@/lib/performance/staffOptimisticTabNavigation";

let tabPanelCacheProbe: ((href: string) => boolean) | null = null;

export function registerStaffTabPanelCacheProbe(probe: ((href: string) => boolean) | null): void {
  tabPanelCacheProbe = probe;
}

export function staffTabPanelCached(href: string): boolean {
  return tabPanelCacheProbe?.(staffBottomTabCacheKey(href)) ?? false;
}

/**
 * Troca instantânea: aba já visitada pinta do keep-alive; o Next só acompanha a URL.
 */
export function tryStaffCachedInstantTabSwitch(currentEffectiveHref: string, targetHref: string): boolean {
  if (!staffGestaoUsaNavegacaoOtimista()) return false;
  if (!isStaffBottomTabPath(currentEffectiveHref) || !isStaffBottomTabPath(targetHref)) {
    return false;
  }
  const from = staffBottomTabCacheKey(currentEffectiveHref);
  const to = staffBottomTabCacheKey(targetHref);
  if (from === to) return false;
  if (!staffTabPanelCached(to)) return false;

  setStaffOptimisticTab(to);
  if (typeof window === "undefined") return true;
  try {
    window.history.replaceState(window.history.state, "", targetHref);
  } catch {
    return false;
  }
  return true;
}
