/**
 * Responsável — após pull operacional, recalcula painéis (Em aberto, Início) sem latch fantasma.
 */
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { getData, isAppDataWarm, updateData } from "@/services/dataStore";
import {
  medirRiquezaStaffGestao,
  staffGestaoRiquezaTotal,
  staffGestaoSnapshotPoorer,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import {
  devePersistirReconciliacaoLivroCaixaGestao,
} from "@/hooks/useReconciliarLivroCaixaGestao";

export function refreshStaffGestaoPainelLeitura(): void {
  resetResponsavelPainelIndexCache();
}

/** Gera lançamentos do livro a partir de PIX confirmados (quando operacional já está na memória). */
export function scheduleStaffLivroReconcileAposOperacional(coopId: string | undefined): void {
  if (!coopId || typeof window === "undefined") return;
  const run = () => {
    if (!isAppDataWarm()) return;
    const data = getData();
    if (!devePersistirReconciliacaoLivroCaixaGestao(data)) return;
    void Promise.all([
      import("@/services/pagamentoIntegridadeService"),
      import("@/services/livroCaixaService"),
    ]).then(([integridade, caixa]) => {
      if (!isAppDataWarm()) return;
      const snap = getData();
      const aligned = integridade.posProcessarIntegridadePagamentosCooperativa(snap);
      const base = aligned !== snap ? aligned : snap;
      const audit = caixa.auditarLivroCaixaContabilCooperativa(base, coopId);
      const falta =
        audit.pagamentosSemDebitoCaixa.length +
        audit.pagamentosSemTaxaCoopCaixa.length +
        audit.pagamentosSemMensalidadeFichaCaixa.length +
        audit.pagamentosSemOutrosDescontosCaixa.length +
        audit.mensalidadesPagasSemCreditoCaixa.length;
      if (falta === 0) return;
      const next = caixa.reconciliarLivroCaixaContabilCooperativa(base, coopId);
      if (next === base) return;
      if (staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(next), medirRiquezaStaffGestao(snap))) {
        return;
      }
      updateData(() => next);
    });
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 8_000 });
  } else {
    window.setTimeout(run, 2_000);
  }
}

export function staffGestaoPainelAposPullOperacional(coopId: string | undefined): void {
  refreshStaffGestaoPainelLeitura();
  scheduleStaffLivroReconcileAposOperacional(coopId);
}
