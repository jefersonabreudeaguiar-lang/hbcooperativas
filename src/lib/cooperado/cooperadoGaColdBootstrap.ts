import type { User } from "@/types";
import {
  cooperadoFinanceiroCardCacheTemValor,
  cooperadoFinanceiroExibicaoCachePronto,
} from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";
import {
  cooperadoGaExibicaoFinanceiraAindaZerada,
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoMobileDeferOperacionalSyncNaAbertura } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoPilotAppDataTemFinanceiroLocal } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { markCooperadoPrimeiraCargaSyncPending } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import {
  cooperadoLocalResumeReady,
  isCooperadoInstantResumeEnabled,
  markNextCooperadoSyncSilent,
  scheduleCooperadoPostInteractiveTask,
} from "@/lib/performance/cooperadoColdStart";
import {
  grantCooperadoEventDrivenSync,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  requestCooperadoPrimeiraCargaSync,
  requestSyncTier,
} from "@/services/syncRequest";
import { scheduleEmpacotarModeloAparelhoJeferson } from "@/lib/cooperado/cooperadoAparelhoJefersonPacote";
import { cooperadoPwaFichaParidadeSnapshotDivergeDeAppData } from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";

const BOOTSTRAP_SESSION_KEY = "hb.coop.gaColdBootstrap.v1";

function bootstrapAlreadyScheduled(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(`${BOOTSTRAP_SESSION_KEY}:${userId}`) === "1";
  } catch {
    return false;
  }
}

function markBootstrapScheduled(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${BOOTSTRAP_SESSION_KEY}:${userId}`, "1");
  } catch {
    /* quota */
  }
}

/** Aparelho sem cache/fatia local — precisa de um operacional_full em background (não no 1º frame). */
export function cooperadoGaAparelhoPrecisaBootstrapNuvem(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !cooperadoMobileDeferOperacionalSyncNaAbertura(user)) {
    return false;
  }
  if (cooperadoAppReleaseNeedsOperacionalSync()) return true;
  if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return true;
  if (cooperadoFinanceiroCardCacheTemValor(user)) return false;
  if (cooperadoPilotAppDataTemFinanceiroLocal(user)) {
    if (cooperadoGaExibicaoFinanceiraAindaZerada(user)) return true;
    if (isAppDataWarm() && user.cooperadoId) {
      const data = getData();
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (coopId) {
        const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
        if (cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(data, canon, coopId)) {
          return true;
        }
      }
    }
    return false;
  }
  if (cooperadoFinanceiroExibicaoCachePronto(user)) return false;
  if (cooperadoLocalResumeReady(user) && cooperadoFinanceiroCardCacheTemValor(user)) {
    return false;
  }
  return true;
}

function dispatchGaPrimeiraCargaSilenciosa(): void {
  markCooperadoPrimeiraCargaSyncPending();
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  if (isCooperadoEventDrivenSync()) {
    requestCooperadoPrimeiraCargaSync();
    return;
  }
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/**
 * Uma carga silenciosa pós-interação — aparelho frio (Orlando e demais).
 * Aparelho quente (Jeferson) não agenda: já tem fatia/cache local.
 */
/** Puxa operacional_full silenciosa quando a UI financeira segue zerada (ex.: após purge de snapshot). */
export function cooperadoGaDispatchPrimeiraCargaSilenciosa(
  user: Omit<User, "password"> | null | undefined,
  opts?: { allowRepeat?: boolean }
): void {
  if (!user?.id || user.role !== "cooperado") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (
    !cooperadoGaAparelhoPrecisaBootstrapNuvem(user) &&
    !(opts?.allowRepeat && cooperadoGaExibicaoFinanceiraAindaZerada(user))
  ) {
    return;
  }
  if (!opts?.allowRepeat && bootstrapAlreadyScheduled(user.id)) return;
  if (!bootstrapAlreadyScheduled(user.id)) {
    markBootstrapScheduled(user.id);
  }
  dispatchGaPrimeiraCargaSilenciosa();
}

export function scheduleCooperadoGaPrimeiraCargaSilenciosa(
  user: Omit<User, "password"> | null | undefined
): void {
  if (!user?.id || user.role !== "cooperado") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!cooperadoGaAparelhoPrecisaBootstrapNuvem(user)) return;
  if (bootstrapAlreadyScheduled(user.id)) return;
  markBootstrapScheduled(user.id);

  const fire = () => {
    if (!cooperadoGaAparelhoPrecisaBootstrapNuvem(user)) {
      scheduleEmpacotarModeloAparelhoJeferson(user);
      return;
    }
    dispatchGaPrimeiraCargaSilenciosa();
    scheduleEmpacotarModeloAparelhoJeferson(user);
  };

  if (isCooperadoInstantResumeEnabled()) {
    scheduleCooperadoPostInteractiveTask(fire);
  } else if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fire, { timeout: 12_000 });
  } else {
    window.setTimeout(fire, 6_000);
  }
}

/** @internal testes */
export function resetCooperadoGaColdBootstrapForTests(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(BOOTSTRAP_SESSION_KEY)) sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
