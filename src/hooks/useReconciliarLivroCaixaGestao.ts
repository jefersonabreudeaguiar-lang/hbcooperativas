"use client";

import { useEffect } from "react";
import { getData, isAppDataWarm, refreshData, subscribe, updateData } from "@/services/dataStore";
import { readAppDataPersistRaw } from "@/lib/staff/staffGestaoPersistKey";
import {
  medirRiquezaStaffGestao,
  staffGestaoRiquezaTotal,
  staffGestaoSnapshotPoorer,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import { staffGestaoDesktopWarmupSyncPaused } from "@/lib/staff/staffGestaoDesktopWarmup";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";

/** Sem cadastro/ficha/PIX não grava — o mount do Início não pode persistir AppData vazio. */
export function devePersistirReconciliacaoLivroCaixaGestao(data: ReturnType<typeof getData>): boolean {
  return staffGestaoRiquezaTotal(medirRiquezaStaffGestao(data)) > 0;
}

function temPagamentoParaLivroCaixa(data: ReturnType<typeof getData>): boolean {
  return (data.pagamentosCooperado ?? []).some(
    (p) => p.status === "confirmado" || p.status === "aguardando_confirmacao"
  );
}

function dadosGestaoOuRelerStorage() {
  let data = getData();
  if (devePersistirReconciliacaoLivroCaixaGestao(data)) return data;
  if (typeof window === "undefined") return data;
  try {
    const raw = readAppDataPersistRaw();
    if (raw && raw.length > 10_000) data = refreshData();
  } catch {
    /* storage */
  }
  return data;
}

const RECONCILE_MIN_GAP_MS = 90_000;
let lastReconcileAt = 0;

/**
 * PIX confirmado: ficha vira paga, sai de Em aberto e entra no Livro Caixa.
 * Só persiste quando já há pagamento — o toque em Início não rebaixa ficha nem zera o painel.
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
      if (staffTabSwitchQuiescenceActive()) return;
      const now = Date.now();
      if (now - lastReconcileAt < RECONCILE_MIN_GAP_MS) return;

      if (staffGestaoDesktopWarmupSyncPaused()) {
        const snap = getData();
        const livroCoop = (snap.livroCaixa ?? []).filter((l) => l.cooperativaId === coopId).length;
        const precisaLivro =
          temPagamentoParaLivroCaixa(snap) &&
          livroCoop === 0 &&
          devePersistirReconciliacaoLivroCaixaGestao(snap);
        if (!precisaLivro) return;
      }
      void Promise.all([
        import("@/services/pagamentoIntegridadeService"),
        import("@/services/livroCaixaService"),
      ])
        .then(([integridade, caixa]) => {
          if (cancelled || !isAppDataWarm()) return;
          if (staffTabSwitchQuiescenceActive()) return;
          const data = dadosGestaoOuRelerStorage();
          if (!devePersistirReconciliacaoLivroCaixaGestao(data)) return;
          if (!temPagamentoParaLivroCaixa(data)) return;
          const aligned = integridade.posProcessarIntegridadePagamentosCooperativa(data);
          if (aligned !== data) {
            if (staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(aligned), medirRiquezaStaffGestao(data))) {
              return;
            }
            lastReconcileAt = Date.now();
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
          if (next !== data) {
            if (staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(next), medirRiquezaStaffGestao(data))) {
              return;
            }
            lastReconcileAt = Date.now();
            updateData(() => next);
          }
        })
        .catch(() => {
          /* Início permanece visível se o caixa falhar */
        });
    };

    const agendar = () => {
      window.clearTimeout(timer);
      if (staffTabSwitchQuiescenceActive()) return;
      const desktop =
        typeof window !== "undefined" && !window.matchMedia("(max-width: 1023px)").matches;
      const delay = desktop ? 12_000 : 1_200;
      timer = window.setTimeout(tentar, delay);
    };

    agendar();
    const unsub = subscribe(() => {
      if (staffTabSwitchQuiescenceActive()) return;
      agendar();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [enabled, coopId]);
}

/** Testes — reset throttle. */
export function resetReconciliarLivroCaixaGestaoThrottleForTests(): void {
  lastReconcileAt = 0;
}
