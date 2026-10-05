import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";

const scrollByTabKey = new Map<string, number>();

export type MobileTabScrollMode = "cooperado" | "staff" | "none";

export function resolveMobileTabScrollKey(
  pathname: string,
  mode: MobileTabScrollMode
): string | null {
  if (mode === "none") return null;
  if (mode === "cooperado") {
    return isCooperadoBottomTabPath(pathname) ? pathname : null;
  }
  if (!isStaffBottomTabPath(pathname)) return null;
  return staffBottomTabCacheKey(pathname);
}

export function saveMobileTabScroll(tabKey: string, scrollTop: number): void {
  scrollByTabKey.set(tabKey, Math.max(0, scrollTop));
}

export function readMobileTabScroll(tabKey: string): number | undefined {
  return scrollByTabKey.get(tabKey);
}

/** Restaura scroll da aba antes da pintura — retorno instantâneo ao voltar. */
export function restoreMobileTabScroll(tabKey: string, mainEl: HTMLElement): void {
  const saved = scrollByTabKey.get(tabKey);
  mainEl.scrollTop = saved ?? 0;
}

export function clearMobileTabScrollMemory(): void {
  scrollByTabKey.clear();
}
