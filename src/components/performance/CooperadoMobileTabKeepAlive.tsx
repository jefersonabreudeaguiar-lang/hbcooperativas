"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
 * RQL 8.6 — cache leve das abas do rodapé (LRU): no máximo 2 telas montadas (+ atual).
 * Reduz pico de JS/RAM vs manter as 5 abas sempre vivas.
 */
export function CooperadoMobileTabKeepAlive({ pathname, children }: Props) {
  const mobile = useCooperadoMobileViewport();
  const enabled = isCooperadoMobileTabKeepAliveEnabled();
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const [, tick] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getCooperadoMobileTabCacheLimit(lowMemory);

  const onTab = isCooperadoBottomTabPath(pathname);

  useLayoutEffect(() => {
    const panelCount = document.querySelectorAll("[data-cooperado-tab-panel]").length;
    publishKeepAliveDomState({ enabled, mobile, onTab, pathname, panelCount });

    if (!enabled || !mobile || !onTab) return;
    cacheRef.current[pathname] = children;
    const merged = [pathname, ...orderRef.current.filter((h) => h !== pathname)];
    const prevOrder = orderRef.current;
    orderRef.current = trimCooperadoTabCacheOrder(merged, pathname, cacheLimit, lowMemory);
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href)) delete cacheRef.current[href];
    }
    tick((n) => n + 1);
  }, [enabled, mobile, onTab, pathname, children, cacheLimit, lowMemory]);

  const panelForHref = (href: string, activePath: string | null): ReactNode | undefined => {
    if (onTab && href === pathname) return children;
    if (activePath === href && onTab) return children;
    return cacheRef.current[href];
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) =>
    COOPERADO_BOTTOM_TAB_HREFS.map((href) => {
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
