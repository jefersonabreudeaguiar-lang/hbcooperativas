"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { scheduleCooperadoBicRevisionPulse } from "@/lib/bic/bicRevisionPulse";
import { cooperadoGaInicioSomenteCasca } from "@/lib/cooperado/cooperadoMobilePilot";

/** Movimento IV — pulso de revisão cooperado mobile BIC. */
export function CooperadoBicRevisionPulseHost() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "cooperado") return;
    if (cooperadoGaInicioSomenteCasca(user)) {
      const t = window.setTimeout(() => scheduleCooperadoBicRevisionPulse(user), 45_000);
      return () => window.clearTimeout(t);
    }
    return scheduleCooperadoBicRevisionPulse(user);
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  return null;
}
