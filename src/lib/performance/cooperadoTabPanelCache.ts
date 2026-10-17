import type { ReactElement, ReactNode } from "react";

/** Evita sobrescrever cache LRU com skeleton de `loading.tsx` na troca de aba. */
export function isCooperadoTabRouteLoadingElement(node: ReactNode): boolean {
  if (!node || typeof node !== "object" || !("type" in node)) return false;
  const el = node as ReactElement;
  const t = el.type as { displayName?: string; name?: string };
  return t?.displayName === "CooperadoTabRouteLoading" || t?.name === "CooperadoTabRouteLoading";
}

/**
 * Não gravar o children da aba anterior na chave da aba nova
 * (`useDeferredValue` / RSC atrasado). Era o que fazia Entregas parecer Início.
 */
export function cooperadoTabCacheMayWriteForPath(opts: {
  pathChanged: boolean;
  childrenUnchanged: boolean;
  childrenIsLoading: boolean;
}): boolean {
  if (opts.childrenIsLoading) return false;
  if (opts.pathChanged && opts.childrenUnchanged) return false;
  return true;
}
