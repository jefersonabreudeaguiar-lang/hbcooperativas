"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import {
  clearCooperadoOptimisticTab,
  getCooperadoOptimisticTabSnapshot,
  resolveCooperadoEffectiveTabPath,
  subscribeCooperadoOptimisticTab,
} from "@/lib/performance/cooperadoOptimisticTabNavigation";

export function useCooperadoEffectiveTabPath(pathname: string): string {
  const optimistic = useSyncExternalStore(
    subscribeCooperadoOptimisticTab,
    getCooperadoOptimisticTabSnapshot,
    () => null
  );

  useEffect(() => {
    if (optimistic && pathname === optimistic) {
      clearCooperadoOptimisticTab(pathname);
    }
  }, [pathname, optimistic]);

  return resolveCooperadoEffectiveTabPath(pathname);
}
