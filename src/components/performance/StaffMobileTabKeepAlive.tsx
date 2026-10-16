"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, useMemo, type ReactNode } from "react";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
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
    if (children == null) return;
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

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const inactiveTabHrefs = useMemo(() => {
    void cacheVersion;
    return orderRef.current.filter((h) => h !== tabKey);
  }, [cacheVersion, tabKey]);

  const renderInactivePanels = () =>
    inactiveTabHrefs.map((href) => {
      const panel = cacheRef.current[href];
      if (!panel) return null;
      return (
        <div
          key={href}
          className="hidden [content-visibility:hidden]"
          aria-hidden
          inert
          data-staff-tab-panel={href}
        >
          {panel}
        </div>
      );
    });

  if (!onTab) {
    const hrefsToRender = [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
    const panels = hrefsToRender.map((href) => {
      const panel = cacheRef.current[href];
      if (!panel) return null;
      return (
        <div key={href} className="hidden [content-visibility:hidden]" aria-hidden data-staff-tab-panel={href}>
          {panel}
        </div>
      );
    });
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
      <div
        className="relative z-[1] w-full min-h-0"
        data-staff-tab-panel={tabKey}
        data-staff-tab-panel-active="1"
      >
        {children ?? <PageSkeleton compact />}
      </div>
      {renderInactivePanels()}
    </CooperadoTabPanelProvider>
  );
}
