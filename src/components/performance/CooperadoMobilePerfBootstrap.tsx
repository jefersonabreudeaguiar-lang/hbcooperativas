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
 * Pré-carrega rotas e recupera a base da gestão após login.
 * Somente leitura da nuvem; aplica cadastro, contratos, pagamentos e caixa ao cache local.
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
        const { syncContratosFromCloud, syncOperacionalFromCloud } = await import("@/services/cooperativaSyncCloudService");
        // Aplicar as leituras em sequência evita salvar fatias sobre um snapshot anterior.
        await cloud.syncCooperadosFromCloud(cnpj, coopId);
        if (cancelled) return;
        await syncContratosFromCloud(cnpj, coopId);
        if (cancelled) return;
        // Pagamentos e caixa devem chegar junto da ficha, antes da revisão dos saldos.
        await syncOperacionalFromCloud(cnpj, { skipDestructiveReset: true });
        const { resetResponsavelPainelIndexCache } = await import("@/services/responsavelPainelIndex");
        resetResponsavelPainelIndexCache();
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
