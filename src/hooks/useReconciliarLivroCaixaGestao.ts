"use client";

import { useEffect, useRef } from "react";
import { getData, isAppDataWarm, updateData } from "@/services/dataStore";

/**
 * Etapa 4 — no painel da gestão, PIX confirmado sem linha no caixa é lançado uma vez.
 * Fora da rota crítica: import dinâmico + atraso, para não derrubar o Início.
 */
export function useReconciliarLivroCaixaGestao(
  coopId: string | undefined,
  enabled: boolean
): void {
  const ranForCoopRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !coopId || !isAppDataWarm()) return;
    if (ranForCoopRef.current === coopId) return;
    ranForCoopRef.current = coopId;

    const timer = window.setTimeout(() => {
      void import("@/services/livroCaixaService")
        .then((mod) => {
          if (!isAppDataWarm()) return;
          const data = getData();
          const audit = mod.auditarLivroCaixaContabilCooperativa(data, coopId);
          const falta =
            audit.pagamentosSemDebitoCaixa.length +
            audit.pagamentosSemTaxaCoopCaixa.length +
            audit.pagamentosSemMensalidadeFichaCaixa.length +
            audit.mensalidadesPagasSemCreditoCaixa.length;
          if (falta === 0) return;
          const next = mod.reconciliarLivroCaixaContabilCooperativa(data, coopId);
          if (next !== data) updateData(() => next);
        })
        .catch(() => {
          /* Início permanece visível se o caixa falhar */
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [enabled, coopId]);
}
