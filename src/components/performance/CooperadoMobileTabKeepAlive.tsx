"use client";

import { useLayoutEffect, useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/utils/format";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import {
  COOPERADO_BOTTOM_TAB_HREFS,
  getCooperadoMobileTabCacheLimit,
  isCooperadoBottomTabPath,
  isCooperadoMobileTabKeepAliveEnabled,
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

function trimTabCache(
  cache: Partial<Record<string, ReactNode>>,
  order: string[],
  limit: number
): string[] {
  const next = [...order];
  while (next.length > limit) {
    const drop = next.pop();
    if (drop) delete cache[drop];
  }
  return next;
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
  const cacheLimit = getCooperadoMobileTabCacheLimit(isLowMemoryDevice());

  const onTab = isCooperadoBottomTabPath(pathname);

  useLayoutEffect(() => {
    if (!enabled || !mobile || !onTab) return;
    cacheRef.current[pathname] = children;
    orderRef.current = trimTabCache(cacheRef.current, [pathname, ...orderRef.current.filter((h) => h !== pathname)], cacheLimit);
    tick((n) => n + 1);
  }, [enabled, mobile, onTab, pathname, children, cacheLimit]);

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
      <>
        <div className="hidden" aria-hidden>
          {renderPanels(null)}
        </div>
        {children}
      </>
    );
  }

  return <>{renderPanels(pathname)}</>;
}
