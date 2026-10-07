"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markUserInteraction, startAppScheduler } from "@/lib/performance/appScheduler";
import { markRqlRouteTransition, scheduleMarkRqlRoutePaintReady } from "@/lib/performance/rqlMarks";
import { isCooperadoBottomTabPath } from "@/lib/performance/cooperadoBottomTabRoutes";
import { markUserActivity } from "@/services/idleActivity";

function routeHopFromPathname(pathname: string): string {
  if (isCooperadoBottomTabPath(pathname)) {
    return pathname.replace(/^\//, "");
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
  const prevHopRef = useRef<string | null>(null);

  useEffect(() => {
    const stop = startAppScheduler();
    return stop;
  }, []);

  useEffect(() => {
    const hop = routeHopFromPathname(pathname);
    const prev = prevHopRef.current;
    let cancelPaint: (() => void) | undefined;
    if (prev && prev !== hop) {
      markRqlRouteTransition(prev, hop);
      cancelPaint = scheduleMarkRqlRoutePaintReady(hop);
      markUserInteraction();
      markUserActivity();
    }
    prevHopRef.current = hop;
    return () => {
      cancelPaint?.();
    };
  }, [pathname]);

  return null;
}
