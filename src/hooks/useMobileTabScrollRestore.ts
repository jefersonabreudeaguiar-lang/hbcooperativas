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
      restoreMobileTabScroll(nextKey, el);
      prevTabKeyRef.current = nextKey;
      return;
    }

    prevTabKeyRef.current = null;
  }, [pathname, scrollMode]);

  return mainRef;
}
