"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markUserInteraction, startAppScheduler } from "@/lib/performance/appScheduler";
import { markRqlRouteTransition } from "@/lib/performance/rqlMarks";
import { markUserActivity } from "@/services/idleActivity";

function routeHopFromPathname(pathname: string): string {
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
    if (prev && prev !== hop) {
      markRqlRouteTransition(prev, hop);
      markUserInteraction();
      markUserActivity();
    }
    prevHopRef.current = hop;
  }, [pathname]);

  return null;
}
