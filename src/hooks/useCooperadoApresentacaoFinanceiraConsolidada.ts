"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoApresentacaoFinanceiraConsolidada,
  cooperadoCarregandoValoresFinanceiros,
} from "@/lib/cooperadoApresentacaoFinanceira";
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
import { getUserCooperativaId } from "@/utils/cooperativa";
import { isAppDataWarm } from "@/services/dataStore";

/** Gate global H203 — quando apresentar projeção financeira cooperado como definitiva na UI. */
export function useCooperadoApresentacaoFinanceiraConsolidada(): {
  apresentacaoConsolidada: boolean;
  carregandoValoresFinanceiros: boolean;
  syncing: boolean;
  syncingForUi: boolean;
  cooperadoPagamentosHydrated: boolean;
} {
  const { user } = useAuth();
  const { syncing, syncingForUi, cooperadoPagamentosHydrated, lastSyncedAt } = useSyncStatus();
  const exibirComDadosLocais =
    user?.role === "cooperado" &&
    isCooperadoManualOperacionalSync() &&
    cooperadoLocalResumeReady(user);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  const financeiroUiGate = useAppDataSelector(
    (data) => {
      if (user?.role !== "cooperado" || !user.cooperadoId) {
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
          ? !financeiroUiGate.aguardandoFatia && financeiroUiGate.consistentes
          : false
        : undefined,
  };
  return {
    apresentacaoConsolidada: cooperadoApresentacaoFinanceiraConsolidada(input),
    carregandoValoresFinanceiros: cooperadoCarregandoValoresFinanceiros(input),
    syncing,
    syncingForUi,
    cooperadoPagamentosHydrated,
  };
}
