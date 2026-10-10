"use client";

import {
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
  type ReactNode,
} from "react";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { COOPERADO_MOBILE_TAB_DOM_POLICY } from "@/lib/performance/cooperadoMobileTabDomPolicy";
import { cn } from "@/utils/format";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import {
  COOPERADO_TAB_FINANCEIRO_HREF,
  COOPERADO_TAB_LIGHT_HREFS,
  COOPERADO_TAB_PIN_HREF,
  getCooperadoMobileTabCacheLimit,
  isCooperadoBottomTabPath,
  isCooperadoMobileTabKeepAliveEnabled,
  isCooperadoTabPinned,
  trimCooperadoTabCacheOrder,
} from "@/lib/performance/cooperadoMobileTabKeepAlive";
import {
  COOPERADO_PINNED_TAB_HREFS,
  isCooperadoPinnedDualMountEnabled,
  setCooperadoPinnedPairCachesReady,
} from "@/lib/performance/cooperadoPinnedTabFastPath";
import { isCooperadoTabRouteLoadingElement } from "@/lib/performance/cooperadoTabPanelCache";
import { useCooperadoEffectiveTabPath } from "@/hooks/useCooperadoEffectiveTabPath";
import { CooperadoTabRouteLoading } from "@/components/performance/CooperadoTabRouteLoading";

function subscribeCooperadoMobileViewport(onChange: () => void): () => void {
  const mq = window.matchMedia("(max-width: 1023px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getCooperadoMobileViewportSnapshot(): boolean {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function getCooperadoMobileViewportServerSnapshot(): boolean {
  return false;
}

function useCooperadoMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeCooperadoMobileViewport,
    getCooperadoMobileViewportSnapshot,
    getCooperadoMobileViewportServerSnapshot
  );
}

type Props = {
  pathname: string;
  children: ReactNode;
};

function publishKeepAliveDomState(state: {
  enabled: boolean;
  mobile: boolean;
  onTab: boolean;
  pathname: string;
  panelCount: number;
}): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {
      try {
        document.documentElement.setAttribute(
          "data-hb-keep-alive-state",
          `e${state.enabled ? 1 : 0}m${state.mobile ? 1 : 0}t${state.onTab ? 1 : 0}p${state.panelCount}:${state.pathname}`
        );
        document.documentElement.setAttribute(
          "data-cooperado-tab-dom-policy",
          COOPERADO_MOBILE_TAB_DOM_POLICY
        );
      } catch {
        /* ignore */
      }
    });
    return;
  }
  try {
    document.documentElement.setAttribute(
      "data-hb-keep-alive-state",
      `e${state.enabled ? 1 : 0}m${state.mobile ? 1 : 0}t${state.onTab ? 1 : 0}p${state.panelCount}:${state.pathname}`
    );
    document.documentElement.setAttribute(
      "data-cooperado-tab-dom-policy",
      COOPERADO_MOBILE_TAB_DOM_POLICY
    );
  } catch {
    /* ignore */
  }
}

/**
 * RQL 8.6 — cache LRU enxuto (3 abas): só monta painéis visitados + atual.
 */
export function CooperadoMobileTabKeepAlive({ pathname, children }: Props) {
  const effectivePath = useCooperadoEffectiveTabPath(pathname);
  const deferredChildren = useDeferredValue(children);
  const mobile = useCooperadoMobileViewport();
  const enabled = isCooperadoMobileTabKeepAliveEnabled();
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getCooperadoMobileTabCacheLimit(lowMemory);

  const onTab = isCooperadoBottomTabPath(effectivePath);

  useLayoutEffect(() => {
    publishKeepAliveDomState({
      enabled,
      mobile,
      onTab,
      pathname: effectivePath,
      panelCount: orderRef.current.length,
    });

    if (!enabled || !mobile || !onTab) return;
    const merged = [
      effectivePath,
      pathname,
      ...orderRef.current.filter((h) => h !== effectivePath && h !== pathname),
    ];
    const prevOrder = orderRef.current;
    const nextOrder = trimCooperadoTabCacheOrder(merged, effectivePath, cacheLimit, lowMemory);
    const orderChanged =
      nextOrder.length !== prevOrder.length || nextOrder.some((h, i) => h !== prevOrder[i]);
    orderRef.current = nextOrder;
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href)) delete cacheRef.current[href];
    }
    if (orderChanged || !prevOrder.includes(effectivePath) || !prevOrder.includes(pathname)) {
      setCacheVersion((n) => n + 1);
    }
  }, [enabled, mobile, onTab, pathname, effectivePath, cacheLimit, lowMemory]);

  useLayoutEffect(() => {
    if (!enabled || !mobile || !onTab) return;
    if (!isCooperadoBottomTabPath(pathname)) return;
    if (isCooperadoTabRouteLoadingElement(deferredChildren)) return;
    cacheRef.current[pathname] = deferredChildren;
  }, [enabled, mobile, onTab, pathname, deferredChildren]);

  useLayoutEffect(() => {
    const ready =
      isCooperadoPinnedDualMountEnabled() &&
      Boolean(cacheRef.current[COOPERADO_TAB_PIN_HREF]) &&
      Boolean(cacheRef.current[COOPERADO_TAB_FINANCEIRO_HREF]);
    setCooperadoPinnedPairCachesReady(ready);
  }, [enabled, mobile, onTab, pathname, deferredChildren, cacheVersion, effectivePath]);

  const pinnedDualReady =
    isCooperadoPinnedDualMountEnabled() &&
    Boolean(cacheRef.current[COOPERADO_TAB_PIN_HREF]) &&
    Boolean(cacheRef.current[COOPERADO_TAB_FINANCEIRO_HREF]);

  const isLightTab = (href: string) =>
    (COOPERADO_TAB_LIGHT_HREFS as readonly string[]).includes(href);

  /**
   * LRU guarda ReactNode em memória, mas só monta no DOM o necessário:
   * - Notas: 1 painel (evita Início+Financeiro+Notas = 3 árvores pesadas).
   * - Início↔Financeiro: dual-mount quando ambos em cache.
   * - Preços: pode ficar montado junto (leve).
   */
  const hrefsMountedInDom = useMemo(() => {
    if (!onTab || !enabled || !mobile) {
      return [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
    }
    const active = effectivePath;
    if (active === "/notas-pedido") {
      return [active];
    }
    if (
      !lowMemory &&
      pinnedDualReady &&
      isCooperadoPinnedDualMountEnabled() &&
      isCooperadoTabPinned(active)
    ) {
      return [...COOPERADO_PINNED_TAB_HREFS];
    }
    const mounted = new Set<string>([active]);
    if (isLightTab(active)) {
      for (const h of orderRef.current) {
        if (isLightTab(h)) mounted.add(h);
      }
    }
    return [...mounted];
  }, [cacheVersion, onTab, enabled, mobile, effectivePath, pinnedDualReady, lowMemory]);

  const resolvePanel = (
    href: string,
    activePath: string
  ): { panel: ReactNode | undefined; warm: boolean } => {
    const active = activePath === href;
    const cached = cacheRef.current[href];
    const liveForHref =
      pathname === href &&
      !isCooperadoTabRouteLoadingElement(deferredChildren) &&
      deferredChildren != null;

    if (active && liveForHref) {
      return { panel: deferredChildren, warm: false };
    }
    if (cached !== undefined) {
      return { panel: cached, warm: !active || pathname !== href };
    }
    if (active) {
      return { panel: <CooperadoTabRouteLoading />, warm: false };
    }
    return { panel: undefined, warm: false };
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) => {
    if (!activePath) return null;

    const nodes = hrefsMountedInDom.map((href) => {
      const active = activePath === href;
      const { panel, warm } = resolvePanel(href, activePath);
      if (!panel) return null;
      const pinnedPair =
        pinnedDualReady && isCooperadoTabPinned(href) && isCooperadoTabPinned(activePath);
      return (
        <div
          key={href}
          className={cn(
            active ? "relative z-[1] w-full min-h-0" : "hidden [content-visibility:hidden]"
          )}
          aria-hidden={!active}
          inert={!active}
          data-cooperado-tab-panel={href}
          data-cooperado-tab-panel-warm={warm ? "1" : undefined}
          data-cooperado-tab-panel-active={active ? "1" : undefined}
          data-cooperado-pinned-dual-mount={pinnedPair ? "1" : undefined}
        >
          {panel}
        </div>
      );
    });

    const hasActive = nodes.some((n) => n != null);
    if (!hasActive) {
      return <CooperadoTabRouteLoading />;
    }
    return <>{nodes}</>;
  };

  const panels = onTab ? renderPanels(effectivePath) : renderPanels(pathname);
  const hasActivePanel =
    onTab &&
    hrefsMountedInDom.some((href) => {
      if (href !== effectivePath) return false;
      const { panel } = resolvePanel(href, effectivePath);
      return panel != null;
    });

  if (!onTab) {
    return (
      <CooperadoTabPanelProvider activeHref={pathname}>
        <>
          <div className="hidden" aria-hidden>
            {panels}
          </div>
          {children}
        </>
      </CooperadoTabPanelProvider>
    );
  }

  return (
    <CooperadoTabPanelProvider activeHref={effectivePath}>
      {hasActivePanel ? (
        <>{panels}</>
      ) : (
        children ?? <CooperadoTabRouteLoading />
      )}
    </CooperadoTabPanelProvider>
  );
}
