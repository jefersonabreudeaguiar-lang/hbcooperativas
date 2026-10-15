"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { scheduleCooperadoGaFinanceiroExibicaoRefresh } from "@/lib/cooperado/cooperadoGaFinanceiroExibicaoRefreshSchedule";
import { scheduleCooperadoReleaseIntegrityWatch } from "@/lib/cooperado/cooperadoReleaseIntegrityWatch";
import { scheduleCooperadoSafeFleetMaintenanceOnce } from "@/lib/pwa/cooperadoFleetCachePurgeOnce";

/** Manutenção local segura 1× por época — cooperado mobile, pós-interação. */
export function CooperadoFleetMaintenanceHost() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role !== "cooperado") return;
    scheduleCooperadoSafeFleetMaintenanceOnce(() => {
      cooperadoPilotForcarRematerializacaoFinanceira(user);
    });
    scheduleCooperadoGaFinanceiroExibicaoRefresh(user);
    scheduleCooperadoReleaseIntegrityWatch(user);
  }, [user?.id, user?.role]);

  return null;
}
