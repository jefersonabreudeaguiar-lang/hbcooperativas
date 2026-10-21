import { isStaffBottomTabPath, staffBottomTabCacheKey } from "@/lib/performance/staffBottomTabRoutes";

let optimisticHref: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** Antes do Next aplicar pathname — mostra o painel já visitado no mesmo toque. */
export function setStaffOptimisticTab(href: string): void {
  if (!isStaffBottomTabPath(href)) return;
  const key = staffBottomTabCacheKey(href);
  if (optimisticHref === key) return;
  optimisticHref = key;
  notify();
}

export function clearStaffOptimisticTab(expected?: string): void {
  if (expected != null && optimisticHref !== staffBottomTabCacheKey(expected)) return;
  if (optimisticHref == null) return;
  optimisticHref = null;
  notify();
}

export function reconcileStaffOptimisticTab(pathname: string): void {
  if (optimisticHref == null) return;
  if (!isStaffBottomTabPath(pathname)) {
    clearStaffOptimisticTab();
    return;
  }
  if (staffBottomTabCacheKey(pathname) === optimisticHref) {
    clearStaffOptimisticTab(pathname);
  }
}

export function getStaffOptimisticTabSnapshot(): string | null {
  return optimisticHref;
}

export function subscribeStaffOptimisticTab(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function resolveStaffEffectiveTabPath(pathname: string): string {
  if (!isStaffBottomTabPath(pathname)) return pathname;
  if (optimisticHref && isStaffBottomTabPath(optimisticHref)) return optimisticHref;
  return staffBottomTabCacheKey(pathname);
}
