"use client";

import { useEffect } from "react";
import { installRqlPerfDebugGlobal, isRqlPerfDebugEnabled } from "@/lib/performance/rqlPerfReport";

/**
 * Homolog Fase 1 — expõe `window.__hbRqlPerf.print()` quando NEXT_PUBLIC_RQL_PERF_DEBUG=1.
 * Zero impacto em produção (default off).
 */
export function RqlPerfDebugBootstrap() {
  useEffect(() => {
    if (!isRqlPerfDebugEnabled()) return;
    document.documentElement.setAttribute("data-rql-perf-debug", "1");
    return installRqlPerfDebugGlobal();
  }, []);
  return null;
}
