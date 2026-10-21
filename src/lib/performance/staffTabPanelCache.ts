import type { ReactElement, ReactNode } from "react";

export function isStaffTabRouteLoadingElement(node: ReactNode): boolean {
  if (!node || typeof node !== "object" || !("type" in node)) return false;
  const el = node as ReactElement;
  const t = el.type as { displayName?: string; name?: string };
  const name = t?.displayName || t?.name || "";
  return name === "PageSkeleton" || name === "CooperadoTabRouteLoading";
}

export function staffTabCacheMayWriteForPath(opts: {
  pathChanged: boolean;
  childrenUnchanged: boolean;
  childrenIsLoading: boolean;
}): boolean {
  if (opts.childrenIsLoading) return false;
  if (opts.pathChanged && opts.childrenUnchanged) return false;
  return true;
}
