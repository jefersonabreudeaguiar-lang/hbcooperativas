"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoApresentacaoFinanceiraConsolidadaForSession } from "@/lib/cooperado/cooperadoApresentacaoFinanceiraPilot";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoLocalResumeReady,
  isCooperadoManualOperacionalSync,
} from "@/lib/performance/cooperadoColdStart";
import { useAppDataSelector } from "@/hooks/useAppData";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import {
  cooperadoAguardandoPrimeiraFatiaFinanceira,
  cooperadoDadosFinanceirosConsistentesParaApresentacao,
} from "@/services/cooperadoFinanceiroGuard";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isAppDataWarm } from "@/services/dataStore";
import { cooperadoFinanceiroBloqueiaEntradaApp } from "@/services/fichaSyncGuard";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoPwaInstantPaintReady } from "@/lib/cooperado/cooperadoPwaInstantResume";

export type CooperadoApresentacaoFinanceiraValue = {
  apresentacaoConsolidada: boolean;
  carregandoValoresFinanceiros: boolean;
  syncing: boolean;
  syncingForUi: boolean;
  cooperadoPagamentosHydrated: boolean;
};

const CooperadoApresentacaoFinanceiraContext = createContext<CooperadoApresentacaoFinanceiraValue | null>(
  null
);

/** Folha L1 — selectors de gate financeiro isolados da casca das abas. */
function CooperadoApresentacaoFinanceiraGateInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { syncing, syncingForUi, cooperadoPagamentosHydrated, lastSyncedAt } = useSyncStatus();
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const padraoJeferson = Boolean(user && isCooperadoMobileGaPromoted(user));

  const exibirComFatiaFinanceiraLocal = useAppDataSelector(
    (data) => {
      if (user?.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return false;
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (!coopId) return false;
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      if (cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId)) return false;
      return cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId);
    },
    [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]
  );

  const exibirComDadosLocais = Boolean(
    user?.role === "cooperado" &&
      (padraoJeferson &&
        (cooperadoLocalResumeReady(user) ||
          cooperadoPwaInstantPaintReady(user) ||
          cooperadoPagamentosHydrated)) ||
      ((isCooperadoManualOperacionalSync() && cooperadoLocalResumeReady(user)) ||
        exibirComFatiaFinanceiraLocal)
  );

  const financeiroUiGate = useAppDataSelector(
    (data) => {
      if (user?.role !== "cooperado" || !user.cooperadoId) {
        return { aguardandoFatia: false, consistentes: true };
      }
      if (padraoJeferson && !isAppDataWarm()) {
        return { aguardandoFatia: false, consistentes: true };
      }
      if (!isAppDataWarm()) {
        return { aguardandoFatia: true, consistentes: false };
      }
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (!coopId) {
        return { aguardandoFatia: true, consistentes: false };
      }
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      const aguardandoFatia = cooperadoAguardandoPrimeiraFatiaFinanceira(
        data,
        cooperadoId,
        coopId,
        { syncing: syncingForUi, lastSyncedAt, offline }
      );
      const consistentes = cooperadoDadosFinanceirosConsistentesParaApresentacao(
        data,
        cooperadoId,
        coopId,
        { offline }
      );
      return { aguardandoFatia, consistentes };
    },
    [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId, syncingForUi, lastSyncedAt, offline]
  );

  const input = {
    role: user?.role,
    syncing: syncingForUi,
    cooperadoPagamentosHydrated,
    exibirComDadosLocais,
    dadosFinanceirosConsistentes:
      user?.role === "cooperado"
        ? financeiroUiGate
          ? !financeiroUiGate.aguardandoFatia &&
            (financeiroUiGate.consistentes ||
              cooperadoPagamentosHydrated ||
              Boolean(exibirComFatiaFinanceiraLocal))
          : false
        : undefined,
  };

  const apresentacaoConsolidada = cooperadoApresentacaoFinanceiraConsolidadaForSession(
    input,
    user,
    pathname
  );
  const carregandoValoresFinanceiros =
    input.role !== "cooperado" ? false : !apresentacaoConsolidada;

  const value = useMemo<CooperadoApresentacaoFinanceiraValue>(
    () => ({
      apresentacaoConsolidada,
      carregandoValoresFinanceiros,
      syncing,
      syncingForUi,
      cooperadoPagamentosHydrated,
    }),
    [
      apresentacaoConsolidada,
      carregandoValoresFinanceiros,
      syncing,
      syncingForUi,
      cooperadoPagamentosHydrated,
    ]
  );

  return (
    <CooperadoApresentacaoFinanceiraContext.Provider value={value}>
      {children}
    </CooperadoApresentacaoFinanceiraContext.Provider>
  );
}

export function CooperadoApresentacaoFinanceiraGate({ children }: { children: ReactNode }) {
  return <CooperadoApresentacaoFinanceiraGateInner>{children}</CooperadoApresentacaoFinanceiraGateInner>;
}

export function useCooperadoApresentacaoFinanceiraConsolidada(): CooperadoApresentacaoFinanceiraValue {
  const ctx = useContext(CooperadoApresentacaoFinanceiraContext);
  if (!ctx) {
    throw new Error(
      "useCooperadoApresentacaoFinanceiraConsolidada requer CooperadoApresentacaoFinanceiraGate"
    );
  }
  return ctx;
}
