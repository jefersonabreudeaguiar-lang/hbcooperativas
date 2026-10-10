"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markUserInteraction, startAppScheduler } from "@/lib/performance/appScheduler";
import {
  markRqlRoutePaintReady,
  markRqlRouteTransition,
  scheduleMarkRqlRoutePaintReady,
} from "@/lib/performance/rqlMarks";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import { cooperadoTabWarmPanelPaintReady } from "@/lib/performance/cooperadoMobileTabKeepAlive";
import { warmCooperadoAdjacentTabRouteChunks } from "@/lib/performance/prefetchCooperadoTabRouteChunks";
import { staffBottomTabCacheKey, isStaffBottomTabPath } from "@/lib/performance/staffBottomTabRoutes";
import { markUserActivity } from "@/services/idleActivity";
import { useCooperadoEffectiveTabPath } from "@/hooks/useCooperadoEffectiveTabPath";

function routeHopFromPathname(pathname: string): string {
  if (isCooperadoBottomTabPath(pathname)) {
    return pathname.replace(/^\//, "");
  }
  if (isStaffBottomTabPath(pathname)) {
    return staffBottomTabCacheKey(pathname).replace(/^\//, "");
  }
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg || "dashboard";
}

/**
 * HX 8.0 — marcas RQL em troca de rota + garante scheduler iniciado no client.
 * O bridge sync ↔ runSync fica em syncRequest.ensureSchedulerBridge.
 */
export function AppSchedulerBootstrap() {
  const pathname = usePathname();
  const effectivePath = useCooperadoEffectiveTabPath(pathname);
  const prevHopRef = useRef<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const start = () => {
      stop = startAppScheduler();
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(start, { timeout: 600 });
      return () => {
        cancelIdleCallback(id);
        stop?.();
      };
    }
    const t = window.setTimeout(start, 0);
    return () => {
      window.clearTimeout(t);
      stop?.();
    };
  }, []);

  useLayoutEffect(() => {
    const hop = routeHopFromPathname(effectivePath);
    const prev = prevHopRef.current;
    let cancelPaint: (() => void) | undefined;
    if (prev && prev !== hop) {
      markRqlRouteTransition(prev, hop);
      if (isCooperadoBottomTabPath(effectivePath) && cooperadoTabWarmPanelPaintReady(effectivePath)) {
        markRqlRoutePaintReady(hop);
      } else {
        cancelPaint = scheduleMarkRqlRoutePaintReady(hop);
      }
      if (isCooperadoBottomTabPath(pathname)) {
        const warmNeighbors = () => warmCooperadoAdjacentTabRouteChunks(pathname);
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(warmNeighbors, { timeout: 5_000 });
        } else {
          window.setTimeout(warmNeighbors, 0);
        }
      }
      markUserInteraction();
      if (!isCooperadoBottomTabPath(effectivePath)) {
        markUserActivity();
      }
    }
    prevHopRef.current = hop;
    return () => {
      cancelPaint?.();
    };
  }, [pathname, effectivePath]);

  return null;
}
