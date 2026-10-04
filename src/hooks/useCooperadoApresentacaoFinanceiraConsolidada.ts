"use client";

import { useAuth } from "@/modules/auth/AuthProvider";
import { useSyncStatus } from "@/components/sync/CooperativaSyncProvider";
import {
  cooperadoApresentacaoFinanceiraConsolidada,
  cooperadoCarregandoValoresFinanceiros,
} from "@/lib/cooperadoApresentacaoFinanceira";

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
  const input = {
    role: user?.role,
    syncing: syncingForUi,
    cooperadoPagamentosHydrated,
  };
  return {
    apresentacaoConsolidada: cooperadoApresentacaoFinanceiraConsolidada(input),
    carregandoValoresFinanceiros: cooperadoCarregandoValoresFinanceiros(input),
    syncing,
    syncingForUi,
    cooperadoPagamentosHydrated,
  };
}
