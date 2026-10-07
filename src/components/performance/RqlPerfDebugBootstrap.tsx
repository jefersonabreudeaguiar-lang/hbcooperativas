"use client";

import { useLayoutEffect } from "react";
import {
  ensureRqlPerfDebugOptInFromUrl,
  installRqlPerfDebugGlobal,
  isRqlPerfDebugEnabled,
} from "@/lib/performance/rqlPerfReport";

/**
 * Fase 1 — `window.__hbRqlPerf.printWhatsappCompare()` (alias `__hbRq1Perf`).
 * Medição completa: NEXT_PUBLIC_RQL_PERF_DEBUG=1, `?hbRqlPerf=1` ou localStorage hb-rql-perf-debug.
 */
export function RqlPerfDebugBootstrap() {
  useLayoutEffect(() => {
    ensureRqlPerfDebugOptInFromUrl();
    if (isRqlPerfDebugEnabled()) {
      document.documentElement.setAttribute("data-rql-perf-debug", "1");
    }
    return installRqlPerfDebugGlobal();
  }, []);
  return null;
}
