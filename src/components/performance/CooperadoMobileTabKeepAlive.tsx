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
  const mobile = useCooperadoMobileViewport();
  const enabled = isCooperadoMobileTabKeepAliveEnabled();
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getCooperadoMobileTabCacheLimit(lowMemory);

  const onTab = isCooperadoBottomTabPath(pathname);

  useLayoutEffect(() => {
    publishKeepAliveDomState({
      enabled,
      mobile,
      onTab,
      pathname,
      panelCount: orderRef.current.length,
    });

    if (!enabled || !mobile || !onTab) return;
    cacheRef.current[pathname] = children;
    const merged = [pathname, ...orderRef.current.filter((h) => h !== pathname)];
    const prevOrder = orderRef.current;
    const nextOrder = trimCooperadoTabCacheOrder(merged, pathname, cacheLimit, lowMemory);
    const orderChanged =
      nextOrder.length !== prevOrder.length || nextOrder.some((h, i) => h !== prevOrder[i]);
    orderRef.current = nextOrder;
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href)) delete cacheRef.current[href];
    }
    if (orderChanged || !prevOrder.includes(pathname)) {
      setCacheVersion((n) => n + 1);
    }
  }, [enabled, mobile, onTab, pathname, children, cacheLimit, lowMemory]);

  const hrefsToRender = useMemo(() => {
    if (onTab && enabled && mobile) {
      return [...new Set([pathname, ...orderRef.current])];
    }
    return [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
  }, [cacheVersion, onTab, enabled, mobile, pathname]);

  const panelForHref = (href: string, activePath: string | null): ReactNode | undefined => {
    if (onTab && href === pathname) return children;
    if (activePath === href && onTab) return children;
    return cacheRef.current[href];
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) =>
    hrefsToRender.map((href) => {
      const active = activePath === href;
      const panel = panelForHref(href, activePath);
      if (!panel) return null;
      return (
        <div
          key={href}
          className={cn(!active && "hidden [content-visibility:hidden]")}
          aria-hidden={!active}
          inert={!active}
          data-cooperado-tab-panel={href}
        >
          {panel}
        </div>
      );
    });

  const panels = onTab ? renderPanels(pathname) : renderPanels(null);

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
    <CooperadoTabPanelProvider activeHref={pathname}>
      <>{panels}</>
    </CooperadoTabPanelProvider>
  );
}
