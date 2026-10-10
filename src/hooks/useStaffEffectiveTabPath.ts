"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  getStaffOptimisticTabSnapshot,
  reconcileStaffOptimisticTab,
  resolveStaffEffectiveTabPath,
  subscribeStaffOptimisticTab,
} from "@/lib/performance/staffOptimisticTabNavigation";

export function useStaffEffectiveTabPath(pathname: string): string {
  const optimistic = useSyncExternalStore(
    subscribeStaffOptimisticTab,
    getStaffOptimisticTabSnapshot,
    () => null
  );

  useLayoutEffect(() => {
    reconcileStaffOptimisticTab(pathname);
  }, [pathname]);

  return resolveStaffEffectiveTabPath(pathname, optimistic);
}
