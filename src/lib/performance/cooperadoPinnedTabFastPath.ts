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
import { setCooperadoOptimisticTab } from "@/lib/performance/cooperadoOptimisticTabNavigation";
import { warmCooperadoTabRouteChunk } from "@/lib/performance/prefetchCooperadoTabRouteChunks";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import {
  cooperadoPilotBottomTabHrefs,
  cooperadoPilotInstantBottomTabSwitchEnabled,
} from "@/lib/cooperado/cooperadoMobilePilotPerf";

const OFF = new Set(["false", "0", "no", "off"]);

let pinnedPairCachesReady = false;
let pilotBottomTabsCachesReady = false;

let tabPanelCacheProbe: ((href: string) => boolean) | null = null;

/** Keep-alive informa se o painel da aba já foi visitado (evita replaceState sem conteúdo). */
export function registerCooperadoTabPanelCacheProbe(
  probe: ((href: string) => boolean) | null
): void {
  tabPanelCacheProbe = probe;
}

export function cooperadoTabPanelCached(href: string): boolean {
  return tabPanelCacheProbe?.(href) ?? false;
}

/** Sinal do keep-alive: Início e Financeiro já foram visitados e estão no cache. */
export function setCooperadoPinnedPairCachesReady(ready: boolean): void {
  pinnedPairCachesReady = ready;
}

export function isCooperadoPinnedPairCachesReady(): boolean {
  return pinnedPairCachesReady;
}

export function setCooperadoPilotBottomTabsCachesReady(ready: boolean): void {
  pilotBottomTabsCachesReady = ready;
}

export function isCooperadoPilotBottomTabsCachesReady(): boolean {
  return pilotBottomTabsCachesReady;
}

/**
 * Troca instantânea entre as 4 abas inferiores quando todas estão em cache.
 * AppLayout completa com router.replace para o Next acompanhar a URL.
 */
export function tryCooperadoPilotInstantBottomTabSwitch(
  currentEffectiveHref: string,
  targetHref: string
): boolean {
  if (!cooperadoPilotInstantBottomTabSwitchEnabled()) return false;
  if (!isCooperadoBottomTabPath(currentEffectiveHref) || !isCooperadoBottomTabPath(targetHref)) {
    return false;
  }
  if (currentEffectiveHref === targetHref) return false;
  if (!cooperadoTabPanelCached(targetHref)) return false;

  setCooperadoOptimisticTab(targetHref);
  if (typeof window === "undefined") return true;
  try {
    window.history.replaceState(window.history.state, "", targetHref);
  } catch {
    return false;
  }
  return true;
}

/**
 * Troca só entre Início ↔ Financeiro com paint instantâneo (cache + URL).
 * O AppLayout ainda faz `router.replace` para o Next não ficar numa rota antiga
 * (senão Entregas mostra Início e o atalho HB some).
 */
export function tryCooperadoPinnedInstantTabSwitch(
  currentEffectiveHref: string,
  targetHref: string
): boolean {
  if (tryCooperadoPilotInstantBottomTabSwitch(currentEffectiveHref, targetHref)) {
    return true;
  }
  if (!isCooperadoPinnedDualMountEnabled() || !pinnedPairCachesReady) return false;
  if (!isCooperadoTabPinned(currentEffectiveHref) || !isCooperadoTabPinned(targetHref)) {
    return false;
  }
  if (currentEffectiveHref === targetHref) return false;
  if (!cooperadoTabPanelCached(targetHref)) return false;

  setCooperadoOptimisticTab(targetHref);
  if (typeof window === "undefined") return true;
  try {
    window.history.replaceState(window.history.state, "", targetHref);
  } catch {
    return false;
  }
  return true;
}

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
  if (typeof window === "undefined") return;
  const pilot = cooperadoPilotInstantBottomTabSwitchEnabled();
  if (!pilot && !isCooperadoPinnedDualMountEnabled()) return;

  const run = () => {
    const hrefs = pilot ? cooperadoPilotBottomTabHrefs() : COOPERADO_PINNED_TAB_HREFS;
    for (const href of hrefs) {
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
