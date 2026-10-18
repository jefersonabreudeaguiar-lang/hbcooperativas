"use client";

import { useEffect } from "react";
import { getData, isAppDataWarm, subscribe, updateData } from "@/services/dataStore";

/**
 * PIX confirmado: ficha vira paga, sai de Em aberto e entra no Livro Caixa.
 * Reavalia quando o AppData muda — um sync tardio não pode deixar pagamento de fora.
 */
export function useReconciliarLivroCaixaGestao(
  coopId: string | undefined,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled || !coopId) return;

    let cancelled = false;
    let timer = 0;

    const tentar = () => {
      if (cancelled || !isAppDataWarm()) return;
      void Promise.all([
        import("@/services/pagamentoIntegridadeService"),
        import("@/services/livroCaixaService"),
      ])
        .then(([integridade, caixa]) => {
          if (cancelled || !isAppDataWarm()) return;
          const data = getData();
          const aligned = integridade.posProcessarIntegridadePagamentosCooperativa(data);
          if (aligned !== data) {
            updateData(() => aligned);
            return;
          }
          const audit = caixa.auditarLivroCaixaContabilCooperativa(data, coopId);
          const falta =
            audit.pagamentosSemDebitoCaixa.length +
            audit.pagamentosSemTaxaCoopCaixa.length +
            audit.pagamentosSemMensalidadeFichaCaixa.length +
            audit.pagamentosSemOutrosDescontosCaixa.length +
            audit.mensalidadesPagasSemCreditoCaixa.length;
          if (falta === 0) return;
          const next = caixa.reconciliarLivroCaixaContabilCooperativa(data, coopId);
          if (next !== data) updateData(() => next);
        })
        .catch(() => {
          /* Início permanece visível se o caixa falhar */
        });
    };

    const agendar = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tentar, 800);
    };

    tentar();
    agendar();
    const unsub = subscribe(agendar);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [enabled, coopId]);
}
