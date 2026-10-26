"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";
import {
  clearStaffOptimisticTab,
  getStaffOptimisticTabSnapshot,
  reconcileStaffOptimisticTab,
  resolveStaffEffectiveTabPath,
  subscribeStaffOptimisticTab,
} from "@/lib/performance/staffOptimisticTabNavigation";

export function useStaffEffectiveTabPath(pathname: string): string {
  useSyncExternalStore(subscribeStaffOptimisticTab, getStaffOptimisticTabSnapshot, () => null);

  useLayoutEffect(() => {
    if (!isStaffMobileViewportActive()) {
      clearStaffOptimisticTab();
      return;
    }
    reconcileStaffOptimisticTab(pathname);
  }, [pathname]);

  return resolveStaffEffectiveTabPath(pathname);
}
