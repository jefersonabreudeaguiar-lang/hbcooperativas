"use client";

import { useMemo } from "react";
import type { AppData } from "@/types";
import {
  buildCooperadoFinanceiroUiSnapshot,
  type BuildCooperadoFinanceiroUiSnapshotOpts,
  type CooperadoFinanceiroUiSnapshot,
} from "@/services/cooperadoFinanceiroUiSnapshot";
import { useContaCoopDescontosRevisionWhenLive } from "@/hooks/useContaCoopDescontosRevision";

/**
 * Uma projeção financeira cooperado por revisão (BIC + painel embutido no snapshot).
 */
export function useCooperadoFinanceiroUiSnapshot(input: {
  active: boolean;
  data: AppData | null;
  cooperadoId: string | undefined;
  cooperativaId: string | undefined;
  opts?: BuildCooperadoFinanceiroUiSnapshotOpts;
  /** PWA adormecido: recalcula só quando read model materializa (sem subscribe HB). */
  frozenFinanceiroEpoch?: number;
}): CooperadoFinanceiroUiSnapshot | null {
  const hbDescontosRevision = useContaCoopDescontosRevisionWhenLive(
    input.frozenFinanceiroEpoch == null
  );
  const financeiroEpoch = input.frozenFinanceiroEpoch ?? hbDescontosRevision;
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
    financeiroEpoch,
    opts?.apresentacaoConsolidada,
    opts?.carregandoNuvem,
    opts?.financeiroSincronizando,
    opts?.dataReady,
    opts?.conferindoPagamentoNuvem,
  ]);
}
