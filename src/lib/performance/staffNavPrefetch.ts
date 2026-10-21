import { isLowMemoryDevice } from "@/services/imagePipelineService";
import type { CooperadoNavPrefetchRouter } from "@/lib/performance/cooperadoNavPrefetch";
import { prefetchStaffNotasPedidoRouteBundle } from "@/lib/performance/prefetchStaffNotasPedidoUi";
import { prefetchStaffTabRouteChunks } from "@/lib/performance/prefetchStaffTabRouteChunks";

/** Rotas do dia do responsável — Início, Conferir, Pagar, Livro. */
export const STAFF_NAV_PREFETCH_PRIORITY: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
  "/cooperados",
];

export const STAFF_MOBILE_PREFETCH_HREFS: readonly string[] = [
  "/dashboard",
  "/notas-pedido",
  "/ficha-corrida",
  "/livro-caixa",
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
    ? (["/dashboard", "/notas-pedido", "/ficha-corrida"] as readonly string[])
    : STAFF_MOBILE_PREFETCH_HREFS;

  queueMicrotask(() => {
    safe(() => prefetchStaffNavRoutes(router, STAFF_NAV_PREFETCH_PRIORITY));
    safe(() => prefetchStaffTabRouteChunks());
  });

  if (lowMemory) {
    return () => {
      cancelled = true;
    };
  }

  const idlePrefetch = () => {
    safe(() => prefetchStaffNavRoutes(router, idleHrefs));
    safe(() => prefetchStaffTabRouteChunks());
  };

  let idleHandle: number | undefined;
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(idlePrefetch, {
      timeout: 2800,
    });
  } else {
    idleHandle = window.setTimeout(idlePrefetch, 900);
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
