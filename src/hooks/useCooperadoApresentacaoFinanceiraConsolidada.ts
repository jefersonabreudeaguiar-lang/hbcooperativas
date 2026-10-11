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
import { cooperadoDadosFinanceirosConsistentesParaApresentacao } from "@/services/cooperadoFinanceiroGuard";
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
  const { syncing, syncingForUi, cooperadoPagamentosHydrated } = useSyncStatus();
  const exibirComDadosLocais =
    user?.role === "cooperado" &&
    isCooperadoManualOperacionalSync() &&
    cooperadoLocalResumeReady(user);

  const dadosFinanceirosConsistentes = useAppDataSelector(
    (data) => {
      if (user?.role !== "cooperado" || !user.cooperadoId) return true;
      if (!isAppDataWarm()) return false;
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (!coopId) return false;
      const cooperadoId = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      return cooperadoDadosFinanceirosConsistentesParaApresentacao(
        data,
        cooperadoId,
        coopId,
        { offline }
      );
    },
    [user?.id, user?.role, user?.cooperadoId, user?.cooperativaId]
  );

  const input = {
    role: user?.role,
    syncing: syncingForUi,
    cooperadoPagamentosHydrated,
    exibirComDadosLocais,
    dadosFinanceirosConsistentes:
      user?.role === "cooperado" ? Boolean(dadosFinanceirosConsistentes) : undefined,
  };
  return {
    apresentacaoConsolidada: cooperadoApresentacaoFinanceiraConsolidada(input),
    carregandoValoresFinanceiros: cooperadoCarregandoValoresFinanceiros(input),
    syncing,
    syncingForUi,
    cooperadoPagamentosHydrated,
  };
}
