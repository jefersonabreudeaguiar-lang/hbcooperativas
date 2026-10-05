"use client";

import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
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

function useCooperadoMobileViewport(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}

type Props = {
  pathname: string;
  children: ReactNode;
};

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

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string | null) =>
    COOPERADO_BOTTOM_TAB_HREFS.map((href) => {
      const active = activePath === href;
      const panel = active && onTab ? children : cacheRef.current[href];
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

  if (!onTab) {
    return (
      <CooperadoTabPanelProvider activeHref={pathname}>
        <>
          <div className="hidden" aria-hidden>
            {renderPanels(null)}
          </div>
          {children}
        </>
      </CooperadoTabPanelProvider>
    );
  }

  return (
    <CooperadoTabPanelProvider activeHref={pathname}>
      <>{renderPanels(pathname)}</>
    </CooperadoTabPanelProvider>
  );
}
