import {
  COOPERADO_FINANCEIRO_TAB_HREF,
  COOPERADO_MOBILE_PREFETCH_HREFS,
} from "@/lib/hb-credit/hbCreditNavPrefetch";
import { isLowMemoryDevice } from "@/services/imagePipelineService";

export type CooperadoNavPrefetchRouter = {
  prefetch: (href: string) => void;
};

/** Rotas críticas do cooperado (bundles maiores) — primeiro lote após login. */
export const COOPERADO_NAV_PREFETCH_PRIORITY: readonly string[] = [
  "/notas-pedido",
  COOPERADO_FINANCEIRO_TAB_HREF,
  "/dashboard",
  "/precos",
  "/mensalidades",
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
    ? (["/dashboard", "/notas-pedido"] as readonly string[])
    : COOPERADO_MOBILE_PREFETCH_HREFS;

  queueMicrotask(() =>
    safe(() => prefetchCooperadoNavRoutes(router, COOPERADO_NAV_PREFETCH_PRIORITY))
  );

  if (lowMemory) {
    return () => {
      cancelled = true;
    };
  }

  const rafId = requestAnimationFrame(() => {
    requestAnimationFrame(() => safe(() => prefetchCooperadoNavRoutes(router, idleHrefs)));
  });

  let idleHandle: number | undefined;
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(() => safe(() => prefetchCooperadoNavRoutes(router, idleHrefs)), {
      timeout: 2500,
    });
  } else {
    idleHandle = window.setTimeout(() => safe(() => prefetchCooperadoNavRoutes(router, idleHrefs)), 800);
  }

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
    if (typeof requestIdleCallback === "function" && idleHandle !== undefined) {
      cancelIdleCallback(idleHandle);
    } else if (idleHandle !== undefined) {
      window.clearTimeout(idleHandle);
    }
  };
}
