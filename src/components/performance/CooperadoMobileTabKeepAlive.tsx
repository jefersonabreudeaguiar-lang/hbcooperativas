"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, useMemo, type ReactNode } from "react";
import { cn } from "@/utils/format";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import {
  COOPERADO_BOTTOM_TAB_HREFS,
  getCooperadoMobileTabCacheLimit,
  isCooperadoBottomTabPath,
  isCooperadoMobileTabKeepAliveEnabled,
  trimCooperadoTabCacheOrder,
} from "@/lib/performance/cooperadoMobileTabKeepAlive";
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
  } catch {
    /* ignore */
  }
}

/**
 * RQL 8.6 — cache LRU enxuto (3 abas): só monta painéis visitados + atual.
 */
export function CooperadoMobileTabKeepAlive({ pathname, children }: Props) {
  const effectivePath = useCooperadoEffectiveTabPath(pathname);
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
    if (isCooperadoTabRouteLoadingElement(children)) return;
    cacheRef.current[pathname] = children;
  }, [enabled, mobile, onTab, pathname, children]);

  const hrefsToRender = useMemo(() => {
    if (onTab && enabled && mobile) {
      return [...new Set([effectivePath, pathname, ...orderRef.current])];
    }
    return [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
  }, [cacheVersion, onTab, enabled, mobile, pathname, effectivePath]);

  const panelForHref = (
    href: string,
    activePath: string | null
  ): { panel: ReactNode | undefined; warm: boolean } => {
    const cached = cacheRef.current[href];
    if (onTab && href === effectivePath) {
      if (
        pathname === href &&
        !isCooperadoTabRouteLoadingElement(children) &&
        children != null
      ) {
        return { panel: children, warm: false };
      }
      if (cached !== undefined) return { panel: cached, warm: true };
      if (pathname !== href) return { panel: <CooperadoTabRouteLoading />, warm: false };
      return { panel: children, warm: false };
    }
    if (activePath === href && onTab) {
      return { panel: children, warm: false };
    }
    if (cached !== undefined) return { panel: cached, warm: true };
    return { panel: undefined, warm: false };
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) =>
    hrefsToRender.map((href) => {
      const active = activePath === href;
      const { panel, warm } = panelForHref(href, activePath);
      if (!panel) return null;
      return (
        <div
          key={href}
          className={cn(
            !active && "hidden [content-visibility:hidden] pointer-events-none",
            active && "min-h-0"
          )}
          aria-hidden={!active}
          inert={!active}
          data-cooperado-tab-panel={href}
          data-cooperado-tab-panel-warm={warm ? "1" : undefined}
          data-cooperado-tab-panel-active={active ? "1" : undefined}
        >
          {/* Só a aba visível monta React — evita 3–4 telas (Entregas/Financeiro) re-renderizando a cada sync. */}
          {active ? panel : null}
        </div>
      );
    });

  const panels = onTab ? renderPanels(effectivePath) : renderPanels(null);

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
      <>{panels}</>
    </CooperadoTabPanelProvider>
  );
}
