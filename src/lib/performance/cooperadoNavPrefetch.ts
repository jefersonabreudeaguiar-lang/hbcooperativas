import {
  COOPERADO_FINANCEIRO_TAB_HREF,
  COOPERADO_MOBILE_PREFETCH_HREFS,
} from "@/lib/hb-credit/hbCreditNavPrefetch";

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

  queueMicrotask(() =>
    safe(() => prefetchCooperadoNavRoutes(router, COOPERADO_NAV_PREFETCH_PRIORITY))
  );

  const rafId = requestAnimationFrame(() => {
    requestAnimationFrame(() => safe(() => prefetchCooperadoNavRoutes(router)));
  });

  let idleHandle: number | undefined;
  if (typeof requestIdleCallback === "function") {
    idleHandle = requestIdleCallback(() => safe(() => prefetchCooperadoNavRoutes(router)), {
      timeout: 1200,
    });
  } else {
    idleHandle = window.setTimeout(() => safe(() => prefetchCooperadoNavRoutes(router)), 400);
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
