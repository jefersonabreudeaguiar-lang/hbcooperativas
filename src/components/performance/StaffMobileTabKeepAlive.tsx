"use client";

import {
  useDeferredValue,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
  startTransition,
  type ReactNode,
} from "react";
import { isLowMemoryDevice } from "@/services/imagePipelineService";
import { CooperadoTabPanelProvider } from "@/lib/performance/cooperadoTabPanelContext";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { useStaffEffectiveTabPath } from "@/hooks/useStaffEffectiveTabPath";
import {
  getStaffMobileTabCacheLimit,
  isStaffBottomTabPath,
  isStaffMobileTabKeepAliveEnabled,
  staffBottomTabCacheKey,
  STAFF_TAB_HEAVY_HREFS,
  trimStaffTabCacheOrder,
} from "@/lib/performance/staffMobileTabKeepAlive";
import { registerStaffTabPanelCacheProbe } from "@/lib/performance/staffPinnedTabFastPath";
import {
  isStaffTabRouteLoadingElement,
  staffTabCacheMayWriteForPath,
} from "@/lib/performance/staffTabPanelCache";
import { markStaffTabPathChange } from "@/lib/staff/staffTabSwitchQuiescence";
import {
  isStaffGestaoMobileViewport,
  subscribeStaffGestaoMobileViewport,
} from "@/lib/staff/staffGestaoViewport";

type Props = {
  pathname: string;
  children: ReactNode;
};

function publishStaffKeepAliveDomState(state: {
  enabled: boolean;
  onTab: boolean;
  pathname: string;
  panelCount: number;
}): void {
  try {
    document.documentElement.setAttribute(
      "data-hb-staff-keep-alive-state",
      `e${state.enabled ? 1 : 0}t${state.onTab ? 1 : 0}p${state.panelCount}:${state.pathname}`
    );
  } catch {
    /* ignore */
  }
}

/**
 * Híbrido do responsável: lastro pinado do dia + troca otimista.
 * Aba já visitada reaparece do cache — Next só acompanha a URL.
 */
export function StaffMobileTabKeepAlive({ pathname, children }: Props) {
  const enabled = isStaffMobileTabKeepAliveEnabled();
  const mobileViewport = useSyncExternalStore(
    subscribeStaffGestaoMobileViewport,
    isStaffGestaoMobileViewport,
    () => false
  );
  const deferredChildren = useDeferredValue(children);
  const effectivePath = useStaffEffectiveTabPath(pathname);
  const cacheRef = useRef<Partial<Record<string, ReactNode>>>({});
  const orderRef = useRef<string[]>([]);
  const lastCommitRef = useRef<{ path: string; child: ReactNode }>({
    path: pathname,
    child: children,
  });
  const [cacheVersion, setCacheVersion] = useState(0);
  const lowMemory = isLowMemoryDevice();
  const cacheLimit = getStaffMobileTabCacheLimit(lowMemory);

  const tabKey = staffBottomTabCacheKey(pathname);
  const activeKey = staffBottomTabCacheKey(effectivePath);
  const onTab = isStaffBottomTabPath(effectivePath);

  useLayoutEffect(() => {
    markStaffTabPathChange(activeKey);

    publishStaffKeepAliveDomState({
      enabled,
      onTab,
      pathname: activeKey,
      panelCount: orderRef.current.length,
    });

    if (!enabled || !onTab) return;
    const merged = [activeKey, tabKey, ...orderRef.current.filter((h) => h !== activeKey && h !== tabKey)];
    const prevOrder = orderRef.current;
    const nextOrder = trimStaffTabCacheOrder(merged, activeKey, cacheLimit, lowMemory);
    const orderChanged =
      nextOrder.length !== prevOrder.length || nextOrder.some((h, i) => h !== prevOrder[i]);
    orderRef.current = nextOrder;
    for (const href of prevOrder) {
      if (!orderRef.current.includes(href)) delete cacheRef.current[href];
    }
    if (orderChanged || !prevOrder.includes(activeKey) || !prevOrder.includes(tabKey)) {
      startTransition(() => setCacheVersion((n) => n + 1));
    }
  }, [enabled, onTab, activeKey, tabKey, cacheLimit, lowMemory]);

  useLayoutEffect(() => {
    const last = lastCommitRef.current;
    const pathChanged = last.path !== pathname;
    const childrenUnchanged = last.child === children;
    lastCommitRef.current = { path: pathname, child: children };

    if (!enabled || !isStaffBottomTabPath(pathname)) return;
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
  }, [enabled, pathname, tabKey, children]);

  useLayoutEffect(() => {
    registerStaffTabPanelCacheProbe((href) => Boolean(cacheRef.current[staffBottomTabCacheKey(href)]));
    return () => registerStaffTabPanelCacheProbe(null);
  }, [enabled, cacheVersion, activeKey]);

  const hrefsMountedInDom = useMemo(() => {
    void cacheVersion;
    if (!onTab || !enabled) {
      return [...new Set([...orderRef.current, ...Object.keys(cacheRef.current)])];
    }
    const active = activeKey;
    if (
      active === "/notas-pedido" ||
      active === "/ficha-corrida" ||
      (STAFF_TAB_HEAVY_HREFS as readonly string[]).includes(active)
    ) {
      return [active];
    }
    return [active];
  }, [cacheVersion, onTab, enabled, activeKey]);

  const resolvePanel = (href: string): { panel: ReactNode | undefined; warm: boolean } => {
    const active = href === activeKey;
    const cached = cacheRef.current[href];
    const last = lastCommitRef.current;
    const childrenStaleForPath = last.path !== pathname && last.child === children;
    const liveNode =
      active && pathname === href && !childrenStaleForPath ? children : deferredChildren;
    const liveForHref =
      tabKey === href &&
      pathname === href &&
      !childrenStaleForPath &&
      !isStaffTabRouteLoadingElement(liveNode) &&
      liveNode != null;

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

  if (!enabled || !mobileViewport) {
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
          className={
            active
              ? "relative z-[1] w-full min-h-0"
              : "hidden [content-visibility:hidden]"
          }
          aria-hidden={!active}
          inert={!active}
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
        <>
          <div className="hidden" aria-hidden>
            {renderPanels(staffBottomTabCacheKey(pathname))}
          </div>
          {children}
        </>
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
