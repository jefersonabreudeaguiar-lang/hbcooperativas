import { isStaffBottomTabPath, staffBottomTabCacheKey } from "@/lib/performance/staffBottomTabRoutes";

export type StaffOptimisticTabState = {
  fromPath: string;
  toPath: string;
};

let optimisticTab: StaffOptimisticTabState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function canStaffTabSwitchInstantly(
  currentPath: string,
  targetPath: string,
  cachedPanelPath: string | null | undefined,
): boolean {
  const targetKey = staffBottomTabCacheKey(targetPath);
  return (
    targetPath === targetKey &&
    isStaffBottomTabPath(targetPath) &&
    staffBottomTabCacheKey(currentPath) !== targetKey &&
    cachedPanelPath === targetPath
  );
}

function getCachedPanelPath(targetPath: string): string | null {
  if (typeof document === "undefined") return null;
  const targetKey = staffBottomTabCacheKey(targetPath);
  const panels = document.querySelectorAll<HTMLElement>("[data-staff-tab-panel]");
  for (const panel of Array.from(panels)) {
    if (panel.getAttribute("data-staff-tab-panel") === targetKey) {
      return panel.getAttribute("data-staff-tab-panel-path");
    }
  }
  return null;
}

/** Ativa o painel já visitado sem esperar o RSC; o router confirma a rota em paralelo. */
export function tryStaffOptimisticTabSwitch(currentPath: string, targetPath: string): boolean {
  const cachedPath = getCachedPanelPath(targetPath);
  if (!canStaffTabSwitchInstantly(currentPath, targetPath, cachedPath)) return false;
  setStaffOptimisticTab(currentPath, targetPath);
  return true;
}

export function setStaffOptimisticTab(fromPath: string, toPath: string): void {
  const toKey = staffBottomTabCacheKey(toPath);
  if (toPath !== toKey || !isStaffBottomTabPath(toPath)) return;
  if (staffBottomTabCacheKey(fromPath) === toKey) return;
  if (optimisticTab?.fromPath === fromPath && optimisticTab.toPath === toPath) return;
  optimisticTab = { fromPath, toPath };
  notify();
}

export function clearStaffOptimisticTab(expectedToPath?: string): void {
  if (expectedToPath != null && optimisticTab?.toPath !== expectedToPath) return;
  if (optimisticTab == null) return;
  optimisticTab = null;
  notify();
}

/** Mantém o estado local enquanto o pathname é a origem; limpa ao confirmar ou sair dela. */
export function reconcileStaffOptimisticTab(pathname: string): void {
  if (optimisticTab == null) return;
  if (pathname === optimisticTab.toPath || pathname !== optimisticTab.fromPath) {
    clearStaffOptimisticTab(optimisticTab.toPath);
  }
}

export function getStaffOptimisticTabSnapshot(): StaffOptimisticTabState | null {
  return optimisticTab;
}

export function subscribeStaffOptimisticTab(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function resolveStaffEffectiveTabPath(
  pathname: string,
  state: StaffOptimisticTabState | null = optimisticTab,
): string {
  return state?.fromPath === pathname ? state.toPath : pathname;
}
