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
  cooperadoPagamentosHydrated: boolean;
} {
  const { user } = useAuth();
  const { syncing, cooperadoPagamentosHydrated } = useSyncStatus();
  const input = {
    role: user?.role,
    syncing,
    cooperadoPagamentosHydrated,
  };
  return {
    apresentacaoConsolidada: cooperadoApresentacaoFinanceiraConsolidada(input),
    carregandoValoresFinanceiros: cooperadoCarregandoValoresFinanceiros(input),
    syncing,
    cooperadoPagamentosHydrated,
  };
}
