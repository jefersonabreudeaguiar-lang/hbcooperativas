/**
 * Empacota no aparelho o mesmo “pacote local” que o celular do piloto Jeferson usa:
 * perf DOM, snapshots PWA, card início, read models — sem ramo especial de conta.
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { applyCooperadoMobilePilotPerfDomFlag } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { tryAckCooperadoAppReleaseWhenLocalReady } from "@/lib/cooperado/cooperadoMobileReleaseLocalAck";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { persistirCooperadoPwaMessengerCaches } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { persistirInicioCardValorReceberCooperado } from "@/services/cooperadoInicioCardPersistenciaService";
import { isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";

/** Materializa caches locais (idempotente). */
export function empacotarModeloAparelhoJeferson(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;

  applyCooperadoMobilePilotPerfDomFlag(user);

  if (!isAppDataWarm()) {
    preloadAppData();
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    void waitForAppDataWarm(18_000).then((warm) => {
      if (warm) empacotarModeloAparelhoJeferson(user);
    });
    return;
  }

  cooperadoPilotForcarRematerializacaoFinanceira(user);
  persistirInicioCardValorReceberCooperado(user);

  if (isCooperadoPwaMessengerMode()) {
    persistirCooperadoPwaMessengerCaches(user, { light: false });
  } else {
    cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user);
  }

  dispatchCooperadoPwaLeveUiSnapshotRefresh();
  tryAckCooperadoAppReleaseWhenLocalReady(user);
  scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
}

/** Após login ou sync — não bloqueia o 1º frame. */
export function scheduleEmpacotarModeloAparelhoJeferson(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user || user.role !== "cooperado") return;
  scheduleCooperadoPostInteractiveTask(() => empacotarModeloAparelhoJeferson(user));
}
