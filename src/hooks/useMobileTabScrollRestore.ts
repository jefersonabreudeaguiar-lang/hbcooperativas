"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  resolveMobileTabScrollKey,
  restoreMobileTabScroll,
  saveMobileTabScroll,
  type MobileTabScrollMode,
} from "@/lib/performance/mobileTabScrollMemory";
import { isMobileBottomTabViewport } from "@/lib/performance/tabSwitchFeedback";

type Options = {
  pathname: string;
  scrollMode: MobileTabScrollMode;
};

/** Salva scroll na troca; restaura no frame seguinte (não bloqueia a pintura da aba). */
export function useMobileTabScrollRestore({ pathname, scrollMode }: Options): RefObject<HTMLElement | null> {
  const mainRef = useRef<HTMLElement | null>(null);
  const prevTabKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el || scrollMode === "none" || !isMobileBottomTabViewport()) return;

    const nextKey = resolveMobileTabScrollKey(pathname, scrollMode);
    const prevKey = prevTabKeyRef.current;

    if (prevKey && prevKey !== nextKey) {
      saveMobileTabScroll(prevKey, el.scrollTop);
    }

    if (nextKey) {
      prevTabKeyRef.current = nextKey;
      requestAnimationFrame(() => {
        if (mainRef.current && prevTabKeyRef.current === nextKey) {
          restoreMobileTabScroll(nextKey, mainRef.current);
        }
      });
      return;
    }

    prevTabKeyRef.current = null;
  }, [pathname, scrollMode]);

  return mainRef;
}
