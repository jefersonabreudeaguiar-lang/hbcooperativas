/**
 * Início ↔ Financeiro — troca quase instantânea no PWA cooperado.
 *
 * Rollback: `NEXT_PUBLIC_COOPERADO_PINNED_DUAL_MOUNT=false` (volta ao modo 228: um painel só).
 */
import {
  COOPERADO_TAB_FINANCEIRO_HREF,
  COOPERADO_TAB_PIN_HREF,
  isCooperadoTabPinned,
} from "@/lib/performance/cooperadoMobileTabKeepAlive";
import { warmCooperadoTabRouteChunk } from "@/lib/performance/prefetchCooperadoTabRouteChunks";

const OFF = new Set(["false", "0", "no", "off"]);

/** Híbrido: mantém Início + Financeiro montados (só estas duas) após primeira visita. */
export function isCooperadoPinnedDualMountEnabled(): boolean {
  const raw =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_COOPERADO_PINNED_DUAL_MOUNT ?? "true")
      : "true";
  return !OFF.has(raw.trim().toLowerCase());
}

export const COOPERADO_PINNED_TAB_HREFS: readonly [string, string] = [
  COOPERADO_TAB_PIN_HREF,
  COOPERADO_TAB_FINANCEIRO_HREF,
];

export function isCooperadoPinnedTabPairHref(href: string): boolean {
  return isCooperadoTabPinned(href);
}

type PrefetchRouter = { prefetch: (href: string) => void };

/** Aquece JS + rotas das duas abas críticas cedo (não espera post-interactive de 2,8s). */
export function scheduleCooperadoPinnedTabsEagerWarm(router: PrefetchRouter): void {
  if (!isCooperadoPinnedDualMountEnabled() || typeof window === "undefined") return;

  const run = () => {
    for (const href of COOPERADO_PINNED_TAB_HREFS) {
      warmCooperadoTabRouteChunk(href);
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
  };

  queueMicrotask(run);
}
