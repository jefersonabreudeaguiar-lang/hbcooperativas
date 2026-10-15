"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { scheduleCooperadoSafeFleetMaintenanceOnce } from "@/lib/pwa/cooperadoFleetCachePurgeOnce";

/** Manutenção local segura 1× por época — cooperado mobile, pós-interação. */
export function CooperadoFleetMaintenanceHost() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role !== "cooperado") return;
    scheduleCooperadoSafeFleetMaintenanceOnce();
  }, [user?.id, user?.role]);

  return null;
}
