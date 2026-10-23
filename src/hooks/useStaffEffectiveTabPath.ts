"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  clearStaffOptimisticTab,
  getStaffOptimisticTabSnapshot,
  reconcileStaffOptimisticTab,
  resolveStaffEffectiveTabPath,
  subscribeStaffOptimisticTab,
} from "@/lib/performance/staffOptimisticTabNavigation";
import {
  isStaffBottomTabPath,
  staffBottomTabCacheKey,
} from "@/lib/performance/staffBottomTabRoutes";
import { isStaffGestaoMobileViewport } from "@/lib/staff/staffGestaoViewport";

export function useStaffEffectiveTabPath(pathname: string): string {
  const optimistic = useSyncExternalStore(
    subscribeStaffOptimisticTab,
    getStaffOptimisticTabSnapshot,
    () => null
  );

  useLayoutEffect(() => {
    reconcileStaffOptimisticTab(pathname);
    if (!isStaffGestaoMobileViewport()) {
      clearStaffOptimisticTab();
    }
  }, [pathname]);

  const canonical = staffBottomTabCacheKey(pathname);
  if (!isStaffGestaoMobileViewport()) return canonical;
  if (optimistic && isStaffBottomTabPath(optimistic)) return optimistic;
  return resolveStaffEffectiveTabPath(pathname);
}
