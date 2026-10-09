"use client";

import { useLayoutEffect } from "react";
import { useSyncExternalStore } from "react";
import {
  getCooperadoOptimisticTabSnapshot,
  reconcileCooperadoOptimisticTab,
  resolveCooperadoEffectiveTabPath,
  subscribeCooperadoOptimisticTab,
} from "@/lib/performance/cooperadoOptimisticTabNavigation";

export function useCooperadoEffectiveTabPath(pathname: string): string {
  const optimistic = useSyncExternalStore(
    subscribeCooperadoOptimisticTab,
    getCooperadoOptimisticTabSnapshot,
    () => null
  );

  useLayoutEffect(() => {
    reconcileCooperadoOptimisticTab(pathname);
  }, [pathname]);

  return resolveCooperadoEffectiveTabPath(pathname);
}
