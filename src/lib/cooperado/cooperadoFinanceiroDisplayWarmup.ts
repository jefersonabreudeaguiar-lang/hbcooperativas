import type { User } from "@/types";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoPilotAppDataTemFinanceiroLocal } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import {
  cooperadoFinanceiroCardCacheTemValor,
  cooperadoFinanceiroDisplayWarmupEligible,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { requestCooperadoFinanceiroRecoverySync } from "@/services/syncRequest";
import { grantCooperadoEventDrivenSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { markCooperadoPrimeiraCargaSyncPending } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import { tryAckCooperadoAppReleaseWhenLocalReady } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";
import { cooperadoMobileDeferOperacionalSyncNaAbertura } from "@/lib/cooperado/cooperadoMobilePilot";
import { preloadAppData, waitForAppDataWarm } from "@/services/dataStore";

let warmupInFlight: Promise<void> | null = null;

function financeWarmupSessionKey(userId: string): string {
  return `hb.coop.financeDisplayWarmup.v1:${userId}`;
}

function financeWarmupAlreadyRanThisSession(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(financeWarmupSessionKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markFinanceWarmupSession(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(financeWarmupSessionKey(userId), "1");
  } catch {
    /* quota */
  }
}

/** Evita recovery/sync duplicado na mesma sessão (FinanceiroGate + Dashboard). */
export function cooperadoFinanceiroDisplayWarmupRanThisSession(userId: string): boolean {
  return financeWarmupAlreadyRanThisSession(userId);
}

/**
 * Padrão HB Créditos: idle → materializa cache local → só então sync leve se ainda vazio.
 * Uma vez por sessão do cooperado (evita rajada de sync após atualização).
 */
export function scheduleCooperadoFinanceiroDisplayWarmup(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!cooperadoFinanceiroDisplayWarmupEligible(user) || !user?.id) return;
  if (financeWarmupAlreadyRanThisSession(user.id)) return;

  const deferSyncNaAbertura = cooperadoMobileDeferOperacionalSyncNaAbertura(user);

  const run = () => {
    if (warmupInFlight) return;
    markFinanceWarmupSession(user.id);
    warmupInFlight = (async () => {
      if (!isCooperadoPwaMessengerMode()) {
        preloadAppData();
      }
      const warmMs = isCooperadoPwaMessengerMode()
        ? 20_000
        : deferSyncNaAbertura
          ? 5_000
          : 12_000;
      const warm = await waitForAppDataWarm(warmMs);
      if (!warm) {
        if (deferSyncNaAbertura) tryAckCooperadoAppReleaseWhenLocalReady(user);
        return;
      }

      cooperadoPilotForcarRematerializacaoFinanceira(user);
      persistirInicioCardValorReceberCooperado(user);
      dispatchCooperadoPwaLeveUiSnapshotRefresh();
      tryAckCooperadoAppReleaseWhenLocalReady(user);

      const temCache = cooperadoFinanceiroCardCacheTemValor(user);
      const temLocal = cooperadoPilotAppDataTemFinanceiroLocal(user);
      if (!temCache && !temLocal && !isCooperadoPwaMessengerMode()) {
        /** GA: nuvem completa só no «Atualizar» — evita operacional_full em Orlando e demais sem cache. */
        if (deferSyncNaAbertura) return;
        markCooperadoPrimeiraCargaSyncPending();
        const pull = () => {
          grantCooperadoEventDrivenSync();
          requestCooperadoFinanceiroRecoverySync();
        };
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(pull, { timeout: 18_000 });
        } else {
          window.setTimeout(pull, 8_000);
        }
      }
    })().finally(() => {
      warmupInFlight = null;
    });
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_500 });
  } else {
    window.setTimeout(run, 400);
  }
}

/** @internal testes */
export function resetCooperadoFinanceiroDisplayWarmupForTests(): void {
  warmupInFlight = null;
}
