import type { User } from "@/types";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import {
  cooperadoFinanceiroCardCacheTemValor,
  cooperadoFinanceiroDisplayWarmupEligible,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { tryAckCooperadoAppReleaseWhenLocalReady } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";
import { scheduleCooperadoGaPrimeiraCargaSilenciosa } from "@/lib/cooperado/cooperadoGaColdBootstrap";
import { scheduleCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import {
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { cooperadoBrowserDesktopFinanceiroEstavel } from "@/lib/cooperado/cooperadoBrowserDesktopPerf";

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
  if (cooperadoBrowserDesktopFinanceiroEstavel(user)) {
    markFinanceWarmupSession(user.id);
    return;
  }

  const run = () => {
    if (warmupInFlight) return;
    warmupInFlight = (async () => {
      if (!isCooperadoPwaMessengerMode()) {
        preloadAppData();
      }
      const warmMs = isCooperadoPwaMessengerMode() ? 20_000 : 12_000;
      const warm = await waitForAppDataWarm(warmMs);
      if (!warm) {
        scheduleCooperadoGaPrimeiraCargaSilenciosa(user);
        return;
      }

      cooperadoPilotForcarRematerializacaoFinanceira(user);
      persistirInicioCardValorReceberCooperado(user);
      dispatchCooperadoPwaLeveUiSnapshotRefresh();
      tryAckCooperadoAppReleaseWhenLocalReady(user);

      const temCache = cooperadoFinanceiroCardCacheTemValor(user);
      if (!temCache && cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) {
        scheduleCooperadoGaSyncBaseInformacoesFinanceiras(user, { silent: true });
      }
      if (temCache || cooperadoGaValorReceberExibicaoResolvida(user)) {
        markFinanceWarmupSession(user.id);
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
