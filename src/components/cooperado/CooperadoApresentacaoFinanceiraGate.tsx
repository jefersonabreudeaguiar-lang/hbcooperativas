"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppData } from "@/types";
import { usePathname } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { cooperadoApresentacaoFinanceiraConsolidadaForSession } from "@/lib/cooperado/cooperadoApresentacaoFinanceiraPilot";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoLocalResumeReady,
  isCooperadoManualOperacionalSync,
} from "@/lib/performance/cooperadoColdStart";
import { useAppDataSelector, useAppDataSelectorForDomains } from "@/hooks/useAppData";
import {
  COOPERADO_BIC_HYBRID_FINANCE_DOMAINS,
  cooperadoBicHybridLightUiActive,
} from "@/lib/cooperado/cooperadoBicHybridLight";
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
  const bicHybridFinance = cooperadoBicHybridLightUiActive(user);

  const exibirFatiaSelector = (data: AppData) => {
    if (user?.role !== "cooperado" || !user.cooperadoId || !isAppDataWarm()) return false;
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return false;
    const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
    if (cooperadoFinanceiroBloqueiaEntradaApp(data, cooperadoId, coopId)) return false;
    return cooperadoTemDadosFinanceirosMinimos(data, cooperadoId, coopId);
  };
  const exibirFatiaDeps = [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId];
  const exibirComFatiaFinanceiraLocalGlobal = useAppDataSelector(exibirFatiaSelector, exibirFatiaDeps);
  const exibirComFatiaFinanceiraLocalDomains = useAppDataSelectorForDomains(
    COOPERADO_BIC_HYBRID_FINANCE_DOMAINS,
    exibirFatiaSelector,
    exibirFatiaDeps
  );
  const exibirComFatiaFinanceiraLocal = bicHybridFinance
    ? exibirComFatiaFinanceiraLocalDomains
    : exibirComFatiaFinanceiraLocalGlobal;

  const exibirComDadosLocais = Boolean(
    user?.role === "cooperado" &&
      (padraoJeferson &&
        (cooperadoLocalResumeReady(user) ||
          cooperadoPwaInstantPaintReady(user) ||
          cooperadoPagamentosHydrated)) ||
      ((isCooperadoManualOperacionalSync() && cooperadoLocalResumeReady(user)) ||
        exibirComFatiaFinanceiraLocal)
  );

  const financeiroUiGateSelector = (data: AppData) => {
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
  };
  const financeiroUiGateDeps = [
    user?.id,
    user?.role,
    user?.cooperadoId,
    user?.cooperativaId,
    syncingForUi,
    lastSyncedAt,
    offline,
    padraoJeferson,
  ];
  const financeiroUiGateGlobal = useAppDataSelector(financeiroUiGateSelector, financeiroUiGateDeps);
  const financeiroUiGateDomains = useAppDataSelectorForDomains(
    COOPERADO_BIC_HYBRID_FINANCE_DOMAINS,
    financeiroUiGateSelector,
    financeiroUiGateDeps
  );
  const financeiroUiGate = bicHybridFinance ? financeiroUiGateDomains : financeiroUiGateGlobal;

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

/** Pagar cooperados (responsável) não passa pelo gate do cooperado — não pode derrubar a aba. */
export const APRESENTACAO_FINANCEIRA_FORA_DO_GATE: CooperadoApresentacaoFinanceiraValue = {
  apresentacaoConsolidada: false,
  carregandoValoresFinanceiros: false,
  syncing: false,
  syncingForUi: false,
  cooperadoPagamentosHydrated: true,
};

export function useCooperadoApresentacaoFinanceiraConsolidada(): CooperadoApresentacaoFinanceiraValue {
  return useContext(CooperadoApresentacaoFinanceiraContext) ?? APRESENTACAO_FINANCEIRA_FORA_DO_GATE;
}
