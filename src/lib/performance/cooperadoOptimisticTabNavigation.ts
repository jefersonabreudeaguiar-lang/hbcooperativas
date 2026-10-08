import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";

let optimisticHref: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

/** Antes do Next aplicar pathname — mostra painel LRU no mesmo toque. */
export function setCooperadoOptimisticTab(href: string): void {
  if (!isCooperadoBottomTabPath(href)) return;
  if (optimisticHref === href) return;
  optimisticHref = href;
  notify();
}

export function clearCooperadoOptimisticTab(expected?: string): void {
  if (expected != null && optimisticHref !== expected) return;
  if (optimisticHref == null) return;
  optimisticHref = null;
  notify();
}

export function getCooperadoOptimisticTabSnapshot(): string | null {
  return optimisticHref;
}

export function subscribeCooperadoOptimisticTab(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function resolveCooperadoEffectiveTabPath(pathname: string): string {
  if (optimisticHref && isCooperadoBottomTabPath(optimisticHref)) return optimisticHref;
  return pathname;
}
