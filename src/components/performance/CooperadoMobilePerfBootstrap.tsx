"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { COOPERADO_FINANCEIRO_TAB_HREF } from "@/lib/hb-credit/hbCreditNavPrefetch";
import { warmupCooperadoFinanceiroTabChunk } from "@/lib/performance/cooperadoFinanceiroTabWarmup";
import { scheduleCooperadoNavPrefetchEarly } from "@/lib/performance/cooperadoNavPrefetch";
import { scheduleStaffNavPrefetchEarly } from "@/lib/performance/staffNavPrefetch";
import { isStaffMobileViewportActive } from "@/lib/performance/staffMobileViewport";
import { isStaffGestaoRole } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { getData } from "@/services/dataStore";
import { resolveGestaoCooperativaId } from "@/utils/cooperativa";

/**
 * Aquecimento agressivo após login — Financeiro cooperado e rotas staff no celular.
 * Não altera dados; só baixa JS antes do toque.
 */
export function CooperadoMobilePerfBootstrap() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || !isStaffGestaoRole(user.role)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const cloud = await import("@/services/cooperadoCloudService");
        const { resolveCooperativaCnpj } = await import("@/services/notaPedidoCloudService");
        const data = getData();
        const cnpj = await resolveCooperativaCnpj(data, resolveGestaoCooperativaId(user, data), user);
        if (!cnpj || cancelled) return;
        const coopId = await cloud.ensureCooperativaLocalForCnpj(cnpj);
        if (!coopId || cancelled) return;
        const { syncContratosFromCloud } = await import("@/services/cooperativaSyncCloudService");
        await Promise.allSettled([
          cloud.syncCooperadosFromCloud(cnpj, coopId),
          syncContratosFromCloud(cnpj, coopId),
        ]);
      })().catch(() => { /* o botão Atualizar mantém a retomada manual disponível */ });
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user?.id, user?.role, user?.cooperativaCnpj]);

  useEffect(() => {
    if (!user) return;

    if (user.role === "cooperado") {
      if (isCooperadoPwaMessengerMode()) {
        const warm = () => warmupCooperadoFinanceiroTabChunk();
        if (typeof requestIdleCallback === "function") {
          const id = requestIdleCallback(warm, { timeout: 1_200 });
          return () => cancelIdleCallback(id);
        }
        const t = window.setTimeout(warm, 150);
        return () => window.clearTimeout(t);
      }
      warmupCooperadoFinanceiroTabChunk();
      try {
        router.prefetch(COOPERADO_FINANCEIRO_TAB_HREF);
      } catch {
        /* ignore */
      }
      return scheduleCooperadoNavPrefetchEarly(router);
    }

    if (isStaffGestaoRole(user.role) && isStaffMobileViewportActive()) {
      return scheduleStaffNavPrefetchEarly(router);
    }

    return undefined;
  }, [user?.id, user?.role, router]);

  return null;
}
