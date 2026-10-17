"use client";

import { useEffect, useRef } from "react";
import { getData, isAppDataWarm, updateData } from "@/services/dataStore";
import {
  auditarLivroCaixaContabilCooperativa,
  reconciliarLivroCaixaContabilCooperativa,
} from "@/services/livroCaixaService";

/**
 * Etapa 4 — no painel da gestão, PIX confirmado sem linha no caixa é lançado uma vez.
 * Idempotente: origemId pg_caixa_ / mens_caixa_.
 */
export function useReconciliarLivroCaixaGestao(
  coopId: string | undefined,
  enabled: boolean
): void {
  const ranForCoopRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !coopId || !isAppDataWarm()) return;
    if (ranForCoopRef.current === coopId) return;
    const data = getData();
    const audit = auditarLivroCaixaContabilCooperativa(data, coopId);
    const falta =
      audit.pagamentosSemDebitoCaixa.length +
      audit.pagamentosSemTaxaCoopCaixa.length +
      audit.pagamentosSemMensalidadeFichaCaixa.length +
      audit.mensalidadesPagasSemCreditoCaixa.length;
    ranForCoopRef.current = coopId;
    if (falta === 0) return;
    const next = reconciliarLivroCaixaContabilCooperativa(data, coopId);
    if (next !== data) updateData(() => next);
  }, [enabled, coopId]);
}
