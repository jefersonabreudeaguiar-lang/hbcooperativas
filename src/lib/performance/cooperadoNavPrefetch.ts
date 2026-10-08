import {
  COOPERADO_FINANCEIRO_TAB_HREF,
  COOPERADO_MOBILE_PREFETCH_HREFS,
} from "@/lib/hb-credit/hbCreditNavPrefetch";
import { COOPERADO_BOTTOM_TAB_HREFS } from "@/lib/performance/cooperadoBottomTabRoutes";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { prefetchCooperadoTabRouteChunks } from "@/lib/performance/prefetchCooperadoTabRouteChunks";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";

export type CooperadoNavPrefetchRouter = {
  prefetch: (href: string) => void;
};

/** Rotas críticas do cooperado (bundles maiores) — primeiro lote após login. */
export const COOPERADO_NAV_PREFETCH_PRIORITY: readonly string[] = [
  COOPERADO_FINANCEIRO_TAB_HREF,
  "/dashboard",
  "/notas-pedido",
  ...COOPERADO_BOTTOM_TAB_HREFS.filter(
    (h) =>
      h !== "/notas-pedido" &&
      h !== COOPERADO_FINANCEIRO_TAB_HREF &&
      h !== "/dashboard"
  ),
];

export function prefetchCooperadoNavRoutes(
  router: CooperadoNavPrefetchRouter,
  hrefs: readonly string[] = COOPERADO_MOBILE_PREFETCH_HREFS
): void {
  for (const href of hrefs) {
    try {
      router.prefetch(href);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Prefetch em camadas (microtask → paint → idle) — troca de aba estilo app nativo.
 */
export function scheduleCooperadoNavPrefetchEarly(router: CooperadoNavPrefetchRouter): () => void {
  let cancelled = false;
  const safe = (fn: () => void) => {
    if (!cancelled) fn();
  };
  const lowMemory = isLowMemoryDevice();
  const idleHrefs = lowMemory
    ? (COOPERADO_BOTTOM_TAB_HREFS as readonly string[])
    : COOPERADO_MOBILE_PREFETCH_HREFS;

  queueMicrotask(() => {
    safe(() => warmupCooperadoFinanceiroTabChunk());
    safe(() => {
      try {
        router.prefetch(COOPERADO_FINANCEIRO_TAB_HREF);
      } catch {
        /* ignore */
      }
    });
    safe(() => prefetchCooperadoNavRoutes(router, COOPERADO_NAV_PREFETCH_PRIORITY));
    if (!lowMemory) {
      safe(() => prefetchCooperadoTabRouteChunks());
    }
  });

  if (lowMemory) {
    return () => {
      cancelled = true;
    };
  }

  let idleHandle: number | undefined;
  const idlePrefetch = () => {
    safe(() => prefetchCooperadoNavRoutes(router, idleHrefs));
    safe(() => prefetchCooperadoTabRouteChunks());
  };
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(idlePrefetch, {
      timeout: 2500,
    });
  } else {
    idleHandle = window.setTimeout(idlePrefetch, 800);
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
