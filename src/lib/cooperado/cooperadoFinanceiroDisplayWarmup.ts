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
import { preloadAppData, waitForAppDataWarm } from "@/services/dataStore";

let warmupInFlight: Promise<void> | null = null;

/**
 * Padrão HB Créditos: idle → materializa cache local → só então sync leve se ainda vazio.
 * Não bloqueia abas; uma execução compartilhada por rajada.
 */
export function scheduleCooperadoFinanceiroDisplayWarmup(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!cooperadoFinanceiroDisplayWarmupEligible(user)) return;

  const run = () => {
    if (warmupInFlight) return;
    warmupInFlight = (async () => {
      preloadAppData();
      const warm = await waitForAppDataWarm(12_000);
      if (!warm) {
        grantCooperadoEventDrivenSync();
        requestCooperadoFinanceiroRecoverySync();
        return;
      }

      cooperadoPilotForcarRematerializacaoFinanceira(user);
      persistirInicioCardValorReceberCooperado(user);
      dispatchCooperadoPwaLeveUiSnapshotRefresh();

      const temCache = cooperadoFinanceiroCardCacheTemValor(user);
      const temLocal = cooperadoPilotAppDataTemFinanceiroLocal(user);
      if (!temCache && !temLocal) {
        grantCooperadoEventDrivenSync();
        requestCooperadoFinanceiroRecoverySync();
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
