"use client";

import { useDeferredValue, useLayoutEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { markStaffTabPathChange } from "@/lib/staff/staffTabSwitchQuiescence";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useStaffEffectiveTabPath } from "@/hooks/useStaffEffectiveTabPath";
import { useStaffMobileViewport } from "@/lib/performance/staffMobileViewport";
import {
  getStaffMobileTabCacheLimit,
  isStaffBottomTabPath,
  isStaffMobileTabKeepAliveEnabled,
  staffBottomTabCacheKey,
  STAFF_TAB_PIN_HREFS,
  trimStaffTabCacheOrder,
} from "@/lib/performance/staffMobileTabKeepAlive";
import { registerStaffTabPanelCacheProbe } from "@/lib/performance/staffPinnedTabFastPath";
import {
  isStaffTabRouteLoadingElement,
  staffTabCacheMayWriteForPath,
} from "@/lib/performance/staffTabPanelCache";

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

function isStaffTabPinned(href: string): boolean {
  return (STAFF_TAB_PIN_HREFS as readonly string[]).includes(href);
}

/**
 * Mobile gestão: uma aba no DOM + cache pinado (troca otimista pinta do cache).
 * Desktop: rota única do Next — sem montar Conferir+Pagar+Início em paralelo.
 */
export function StaffMobileTabKeepAlive({ pathname, children }: Props) {
  const enabled = isStaffMobileTabKeepAliveEnabled();
  const mobile = useStaffMobileViewport();
  const effectivePath = useStaffEffectiveTabPath(pathname);
  const deferredChildren = useDeferredValue(children);
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const lastCommitRef = useRef<{ path: string; child: ReactNode }>({
    path: pathname,
    child: children,
  });
  const [cacheVersion, setCacheVersion] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getStaffMobileTabCacheLimit(lowMemory);
  const lastMarkedPathRef = useRef<string | null>(null);

  const tabKey = staffBottomTabCacheKey(pathname);
  const activeKey = staffBottomTabCacheKey(effectivePath);
  const onTab = isStaffBottomTabPath(effectivePath);

  useLayoutEffect(() => {
    if (!enabled || !mobile) return;
    if (lastMarkedPathRef.current !== effectivePath) {
      lastMarkedPathRef.current = effectivePath;
      markStaffTabPathChange(effectivePath);
    }

    publishStaffKeepAliveDomState({
      enabled,
      mobile,
      onTab,
      pathname: activeKey,
      panelCount: orderRef.current.length,
    });

    if (!onTab) return;
    const merged = [activeKey, tabKey, ...orderRef.current.filter((h) => h !== activeKey && h !== tabKey)];
    const prevOrder = orderRef.current;
    const nextOrder = trimStaffTabCacheOrder(merged, activeKey, cacheLimit, lowMemory);
    const orderChanged =
      nextOrder.length !== prevOrder.length || nextOrder.some((h, i) => h !== prevOrder[i]);
    orderRef.current = nextOrder;
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href) && !isStaffTabPinned(href)) {
        delete cacheRef.current[href];
      }
    }
    if (orderChanged || !prevOrder.includes(activeKey) || !prevOrder.includes(tabKey)) {
      setCacheVersion((n) => n + 1);
    }
  }, [enabled, mobile, onTab, activeKey, tabKey, cacheLimit, lowMemory, effectivePath]);

  useLayoutEffect(() => {
    if (!enabled || !mobile) return;
    const last = lastCommitRef.current;
    const pathChanged = last.path !== pathname;
    const childrenUnchanged = last.child === children;
    lastCommitRef.current = { path: pathname, child: children };

    if (!isStaffBottomTabPath(pathname)) return;
    if (
      !staffTabCacheMayWriteForPath({
        pathChanged,
        childrenUnchanged,
        childrenIsLoading: isStaffTabRouteLoadingElement(children),
      })
    ) {
      return;
    }
    cacheRef.current[tabKey] = children;
  }, [enabled, mobile, pathname, tabKey, children]);

  useLayoutEffect(() => {
    if (!enabled || !mobile) {
      registerStaffTabPanelCacheProbe(null);
      return;
    }
    registerStaffTabPanelCacheProbe((href) => Boolean(cacheRef.current[staffBottomTabCacheKey(href)]));
    return () => registerStaffTabPanelCacheProbe(null);
  }, [enabled, mobile, cacheVersion, activeKey]);

  const hrefsMountedInDom = useMemo(() => {
    void cacheVersion;
    if (!enabled || !mobile || !onTab) {
      return [activeKey];
    }
    return [activeKey];
  }, [cacheVersion, onTab, enabled, mobile, activeKey]);

  const resolvePanel = (href: string): { panel: ReactNode | undefined; warm: boolean } => {
    const active = href === activeKey;
    const cached = cacheRef.current[href];
    const last = lastCommitRef.current;
    const childrenStaleForPath = last.path !== pathname && last.child === children;
    const liveNode =
      active && tabKey === href
        ? isStaffTabRouteLoadingElement(children)
          ? isStaffTabRouteLoadingElement(deferredChildren)
            ? children
            : deferredChildren
          : children
        : deferredChildren;
    const liveForHref =
      tabKey === href &&
      !childrenStaleForPath &&
      liveNode != null &&
      !isStaffTabRouteLoadingElement(liveNode);

    if (active && liveForHref) {
      return { panel: liveNode, warm: false };
    }
    if (active && cached !== undefined && tabKey !== href) {
      return { panel: cached, warm: true };
    }
    if (cached !== undefined) {
      return { panel: cached, warm: !active || tabKey !== href };
    }
    if (active) {
      return { panel: <PageSkeleton compact />, warm: false };
    }
    return { panel: undefined, warm: false };
  };

  if (!enabled || !mobile) {
    return <>{children}</>;
  }

  const renderPanels = (activePath: string) =>
    hrefsMountedInDom.map((href) => {
      const { panel, warm } = resolvePanel(href);
      if (!panel) return null;
      const active = href === activePath;
      return (
        <div
          key={href}
          className={active ? "relative z-[1] w-full min-h-0" : "hidden"}
          aria-hidden={!active}
          data-staff-tab-panel={href}
          data-staff-tab-panel-warm={warm ? "1" : undefined}
          data-staff-tab-panel-active={active ? "1" : undefined}
        >
          {panel}
        </div>
      );
    });

  if (!onTab) {
    return (
      <CooperadoTabPanelProvider activeHref={pathname}>
        {children}
      </CooperadoTabPanelProvider>
    );
  }

  const hasCachedOrLive = hrefsMountedInDom.some((href) => resolvePanel(href).panel != null);

  return (
    <CooperadoTabPanelProvider activeHref={activeKey}>
      {hasCachedOrLive ? (
        <>{renderPanels(activeKey)}</>
      ) : (
        children ?? <PageSkeleton compact />
      )}
    </CooperadoTabPanelProvider>
  );
}
