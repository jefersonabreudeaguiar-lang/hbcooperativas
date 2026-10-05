import { isLowMemoryDevice } from "@/services/imagePipelineService";
import type { CooperadoNavPrefetchRouter } from "@/lib/performance/cooperadoNavPrefetch";
import { prefetchStaffNotasPedidoRouteBundle } from "@/lib/performance/prefetchStaffNotasPedidoUi";

/** Rotas mais abertas pelo responsável no celular — bundles grandes. */
export const STAFF_NAV_PREFETCH_PRIORITY: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/cooperados",
  "/livro-caixa",
];

export const STAFF_MOBILE_PREFETCH_HREFS: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/cooperados",
  "/financeiro",
  "/relatorios",
  "/conta-coop",
  "/prestacao-contas",
];

function prefetchStaffNavRoutes(
  router: CooperadoNavPrefetchRouter,
  hrefs: readonly string[]
): void {
  for (const href of hrefs) {
    try {
      router.prefetch(href);
      if (href === "/notas-pedido") prefetchStaffNotasPedidoRouteBundle();
    } catch {
      /* ignore */
    }
  }
}

/** Prefetch em camadas para gestão mobile — paridade com cooperadoNavPrefetch. */
export function scheduleStaffNavPrefetchEarly(router: CooperadoNavPrefetchRouter): () => void {
  let cancelled = false;
  const safe = (fn: () => void) => {
    if (!cancelled) fn();
  };
  const lowMemory = isLowMemoryDevice();
  const idleHrefs = lowMemory
    ? (["/dashboard", "/notas-pedido"] as readonly string[])
    : STAFF_MOBILE_PREFETCH_HREFS;

  queueMicrotask(() =>
    safe(() => prefetchStaffNavRoutes(router, STAFF_NAV_PREFETCH_PRIORITY))
  );

  if (lowMemory) {
    return () => {
      cancelled = true;
    };
  }

  let idleHandle: number | undefined;
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(() => safe(() => prefetchStaffNavRoutes(router, idleHrefs)), {
      timeout: 2800,
    });
  } else {
    idleHandle = window.setTimeout(() => safe(() => prefetchStaffNavRoutes(router, idleHrefs)), 900);
  }

  return () => {
    cancelled = true;
    if (typeof requestIdleCallback === "function" && idleHandle !== undefined) {
      cancelIdleCallback(idleHandle);
    } else if (idleHandle !== undefined) {
      window.clearTimeout(idleHandle);
    }
  };
}
