"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { COOPERADO_FINANCEIRO_TAB_HREF } from "@/lib/hb-credit/hbCreditNavPrefetch";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";
import { scheduleCooperadoNavPrefetchEarly } from "@/lib/performance/cooperadoNavPrefetch";
import { scheduleStaffNavPrefetchEarly } from "@/lib/performance/staffNavPrefetch";
import { isStaffGestaoRole } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";

/**
 * Aquecimento agressivo após login — Financeiro cooperado e rotas staff no celular.
 * Não altera dados; só baixa JS antes do toque.
 */
export function CooperadoMobilePerfBootstrap() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    if (user.role === "cooperado") {
      if (isCooperadoPwaMessengerMode()) {
        return undefined;
      }
      warmupCooperadoFinanceiroTabChunk();
      try {
        router.prefetch(COOPERADO_FINANCEIRO_TAB_HREF);
      } catch {
        /* ignore */
      }
      return scheduleCooperadoNavPrefetchEarly(router);
    }

    if (isStaffGestaoRole(user.role)) {
      return scheduleStaffNavPrefetchEarly(router);
    }

    return undefined;
  }, [user?.id, user?.role, router]);

  return null;
}
