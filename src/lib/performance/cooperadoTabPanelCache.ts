import type { ReactElement, ReactNode } from "react";

/** Evita sobrescrever cache LRU com skeleton de `loading.tsx` na troca de aba. */
export function isCooperadoTabRouteLoadingElement(node: ReactNode): boolean {
  if (!node || typeof node !== "object" || !("type" in node)) return false;
  const el = node as ReactElement;
  const t = el.type as { displayName?: string; name?: string };
  return t?.displayName === "CooperadoTabRouteLoading" || t?.name === "CooperadoTabRouteLoading";
}
