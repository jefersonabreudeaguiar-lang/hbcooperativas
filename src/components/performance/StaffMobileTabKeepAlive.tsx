"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, useMemo, type ReactNode } from "react";
import { cn } from "@/utils/format";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import {
  getStaffMobileTabCacheLimit,
  isStaffBottomTabPath,
  isStaffMobileTabKeepAliveEnabled,
  staffBottomTabCacheKey,
  trimStaffTabCacheOrder,
} from "@/lib/performance/staffMobileTabKeepAlive";

function subscribeMobileViewport(onChange: () => void): () => void {
  const mq = window.matchMedia("(max-width: 1023px)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMobileViewportSnapshot(): boolean {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function useMobileViewport(): boolean {
  return useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);
}

type Props = {
  pathname: string;
  children: ReactNode;
};

function publishStaffKeepAliveDomState(state: {
  enabled: boolean;
  mobile: boolean;
  onTab: boolean;
  pathname: string;
  panelCount: number;
}): void {
  try {
    document.documentElement.setAttribute(
      "data-hb-staff-keep-alive-state",
      `e${state.enabled ? 1 : 0}m${state.mobile ? 1 : 0}t${state.onTab ? 1 : 0}p${state.panelCount}:${state.pathname}`
    );
  } catch {
    /* ignore */
  }
}

/**
 * U4 — cache LRU das abas do rodapé da gestão no celular (mesmo contrato do cooperado).
 */
export function StaffMobileTabKeepAlive({ pathname, children }: Props) {
  const mobile = useMobileViewport();
  const enabled = isStaffMobileTabKeepAliveEnabled();
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getStaffMobileTabCacheLimit(lowMemory);

  const tabKey = staffBottomTabCacheKey(pathname);
  const onTab = isStaffBottomTabPath(pathname);

  useLayoutEffect(() => {
    publishStaffKeepAliveDomState({
      enabled,
      mobile,
      onTab,
      pathname: tabKey,
      panelCount: orderRef.current.length,
    });

    if (!enabled || !mobile || !onTab) return;
    cacheRef.current[tabKey] = children;
    const merged = [tabKey, ...orderRef.current.filter((h) => h !== tabKey)];
    const prevOrder = orderRef.current;
    const nextOrder = trimStaffTabCacheOrder(merged, tabKey, cacheLimit, lowMemory);
    const orderChanged =
      nextOrder.length !== prevOrder.length || nextOrder.some((h, i) => h !== prevOrder[i]);
    orderRef.current = nextOrder;
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href)) delete cacheRef.current[href];
    }
    if (orderChanged || !prevOrder.includes(tabKey)) {
      setCacheVersion((n) => n + 1);
    }
  }, [enabled, mobile, onTab, tabKey, pathname, children, cacheLimit, lowMemory]);

  const panelForKey = (href: string, activeKey: string | null): ReactNode | undefined => {
    if (onTab && href === tabKey) return children;
    if (activeKey === href && onTab) return children;
    return cacheRef.current[href];
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const hrefsToRender = useMemo(() => {
    if (onTab) {
      return [...new Set([tabKey, ...orderRef.current])];
    }
    return [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
  }, [cacheVersion, onTab, tabKey]);

  const renderPanels = (activeKey: string | null) =>
    hrefsToRender.map((href) => {
      const active = activeKey === href;
      const panel = panelForKey(href, activeKey);
      if (!panel) return null;
      return (
        <div
          key={href}
          className={cn(!active && "hidden [content-visibility:hidden]")}
          aria-hidden={!active}
          inert={!active}
          data-staff-tab-panel={href}
        >
          {panel}
        </div>
      );
    });

  const panels = onTab ? renderPanels(tabKey) : renderPanels(null);

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
    <CooperadoTabPanelProvider activeHref={tabKey}>
      <>{panels}</>
    </CooperadoTabPanelProvider>
  );
}
