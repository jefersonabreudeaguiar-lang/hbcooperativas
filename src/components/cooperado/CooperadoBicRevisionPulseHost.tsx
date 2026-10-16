"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { scheduleCooperadoBicRevisionPulse } from "@/lib/bic/bicRevisionPulse";

/** Movimento IV — pulso de revisão cooperado mobile BIC. */
export function CooperadoBicRevisionPulseHost() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "cooperado") return;
    return scheduleCooperadoBicRevisionPulse(user);
  }, [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]);

  return null;
}
