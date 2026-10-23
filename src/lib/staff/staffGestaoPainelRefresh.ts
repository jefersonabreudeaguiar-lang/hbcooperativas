/**
 * Responsável — após pull operacional, recalcula painéis (Em aberto, Início) sem latch fantasma.
 */
import { resetResponsavelPainelIndexCache } from "@/services/responsavelPainelIndex";
import { getData, getSession, isAppDataWarm, updateData, waitForAppDataWarm } from "@/services/dataStore";
import {
  medirRiquezaStaffGestao,
  peekStaffGestaoLastGood,
  preservarStaffGestaoContraWipe,
  staffGestaoRiquezaTotal,
  staffGestaoSnapshotPoorer,
} from "@/lib/staff/staffGestaoSnapshotGuard";
import {
  staffGestaoTemFichaOuNotaLocal,
  staffLocalOperacionalVazio,
} from "@/lib/staff/staffOperacionalColdHydrate";
import { isStaffGestaoRole } from "@/lib/staff/staffResponsavelSyncPolicy";
import { staffTabSwitchQuiescenceActive } from "@/lib/staff/staffTabSwitchQuiescence";
import { requestSyncTier } from "@/services/syncRequest";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  devePersistirReconciliacaoLivroCaixaGestao,
} from "@/hooks/useReconciliarLivroCaixaGestao";

export function refreshStaffGestaoPainelLeitura(): void {
  resetResponsavelPainelIndexCache();
}

/** Live pior que lastro (session) — repõe cooperados/notas/ficha em todas as abas. */
export async function staffGestaoRestaurarLastroSeLivePobre(): Promise<boolean> {
  if (!isAppDataWarm()) {
    await waitForAppDataWarm();
  }
  if (!isAppDataWarm()) return false;
  const user = getSession();
  if (!user || !isStaffGestaoRole(user.role)) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  const lkg = peekStaffGestaoLastGood();
  if (!lkg) return false;
  const liveR = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(data, coopId));
  const lkgR = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(lkg, coopId));
  if (lkgR <= liveR + 1) return false;
  updateData(() => preservarStaffGestaoContraWipe(lkg, getData()));
  refreshStaffGestaoPainelLeitura();
  return true;
}

export function staffGestaoPrecisaHidratarOperacional(): boolean {
  if (!isAppDataWarm()) return false;
  const user = getSession();
  if (!user || !isStaffGestaoRole(user.role)) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  const rich = staffGestaoRiquezaTotal(medirRiquezaStaffGestao(data, coopId));
  if (staffGestaoTemFichaOuNotaLocal(data, coopId) && rich >= 5) return false;
  if (rich < 3) return true;
  return (
    staffLocalOperacionalVazio(data, coopId) && !staffGestaoTemFichaOuNotaLocal(data, coopId)
  );
}

let hidratacaoPesadaTimer: number | null = null;
let lastHidratacaoPesadaAt = 0;
const HIDRATACAO_PESADA_MIN_GAP_MS = 120_000;

export function requestStaffGestaoOperacionalFullSePreciso(): void {
  if (!staffGestaoPrecisaHidratarOperacional()) return;
  requestSyncTier("operacional_full", {
    force: true,
    userInitiated: false,
    eventDriven: true,
  });
}

/** Só aparelho frio — adiado e em idle; nunca em cada toque de aba. */
export function scheduleStaffGestaoPainelHidratacaoSeVazio(): void {
  if (typeof window === "undefined") return;
  if (!staffGestaoPrecisaHidratarOperacional()) return;
  const now = Date.now();
  if (now - lastHidratacaoPesadaAt < HIDRATACAO_PESADA_MIN_GAP_MS) return;
  if (hidratacaoPesadaTimer != null) return;

  const delayMs = staffTabSwitchQuiescenceActive() ? 10_000 : 6_000;
  hidratacaoPesadaTimer = window.setTimeout(() => {
    hidratacaoPesadaTimer = null;
    if (!staffGestaoPrecisaHidratarOperacional()) return;
    const run = () => {
      void staffGestaoRestaurarLastroSeLivePobre().then(() => {
        if (!staffGestaoPrecisaHidratarOperacional()) return;
        lastHidratacaoPesadaAt = Date.now();
        requestStaffGestaoOperacionalFullSePreciso();
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 12_000 });
    } else {
      window.setTimeout(run, 500);
    }
  }, delayMs);
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
