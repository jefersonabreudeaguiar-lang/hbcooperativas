"use client";

import { useMemo } from "react";
import type { AppData } from "@/types";
import {
  buildCooperadoFinanceiroUiSnapshot,
  type BuildCooperadoFinanceiroUiSnapshotOpts,
  type CooperadoFinanceiroUiSnapshot,
} from "@/services/cooperadoFinanceiroUiSnapshot";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";

/**
 * Uma projeção financeira cooperado por revisão (BIC + painel embutido no snapshot).
 */
export function useCooperadoFinanceiroUiSnapshot(input: {
  active: boolean;
  data: AppData | null;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  opts?: BuildCooperadoFinanceiroUiSnapshotOpts;
}): CooperadoFinanceiroUiSnapshot | null {
  const hbDescontosRevision = useContaCoopDescontosRevision();
  const { active, data, cooperadoId, cooperativaId, opts } = input;

  return useMemo(() => {
    if (!active || !data || !cooperadoId) return null;
    return buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId,
      cooperativaId,
      opts,
    });
  }, [
    active,
    data,
    cooperadoId,
    cooperativaId,
    hbDescontosRevision,
    opts?.apresentacaoConsolidada,
    opts?.carregandoNuvem,
    opts?.financeiroSincronizando,
    opts?.dataReady,
    opts?.conferindoPagamentoNuvem,
  ]);
}
