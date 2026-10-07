"use client";

import { useLayoutEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { canUseRqlPerfHomologPanel } from "@/lib/performance/rqlPerfHomologAccess";
import {
  ensureRqlPerfDebugOptInFromUrl,
  installRqlPerfDebugGlobal,
  isRqlPerfDebugEnabled,
} from "@/lib/performance/rqlPerfReport";

/**
 * Medição completa só cooperado Orlando — ver `canUseRqlPerfHomologPanel`.
 */
export function RqlPerfDebugBootstrap() {
  const { user } = useAuth();

  useLayoutEffect(() => {
    ensureRqlPerfDebugOptInFromUrl();
    const orlandoCooperado = canUseRqlPerfHomologPanel(user);
    const enabled = isRqlPerfDebugEnabled() && orlandoCooperado;
    if (enabled) {
      document.documentElement.setAttribute("data-rql-perf-debug", "1");
    } else {
      document.documentElement.removeAttribute("data-rql-perf-debug");
    }
    return installRqlPerfDebugGlobal(enabled);
  }, [user?.id, user?.cooperadoId, user?.role, user?.mobileCooperadoId]);
  return null;
}
