import type { User } from "@/types";
import type { CooperadoReleasePolicy } from "@/lib/cooperado/cooperadoReleasePolicy";
import {
  cooperadoClientBuildMeetsMin,
  embeddedCooperadoReleasePolicy,
} from "@/lib/cooperado/cooperadoReleasePolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { empacotarModeloAparelhoJeferson } from "@/lib/cooperado/cooperadoAparelhoJefersonPacote";
import {
  cooperadoGaExibicaoFinanceiraConfiavel,
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import {
  clearCooperadoPostDeployDegraded,
  cooperadoPostDeployAckMatches,
  markCooperadoPostDeployAck,
  setCooperadoPostDeployQueueActive,
} from "@/lib/cooperado/cooperadoPostDeploySession";
import { markCooperadoPrimeiraCargaSyncPending } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  grantCooperadoEventDrivenSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { markNextCooperadoSyncSilent } from "@/lib/performance/cooperadoColdStart";
import { cooperadoPostDeployReloadHref } from "@/lib/cooperado/cooperadoPostDeployQueue";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { requestSyncTier } from "@/services/syncRequest";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { isAppDataWarm, waitForAppDataWarm } from "@/services/dataStore";

const SESSION_PREFIX = "hb.coop.silentReleaseBootstrap.v1";

function sessionKey(userId: string, policy: CooperadoReleasePolicy): string {
  return `${SESSION_PREFIX}:${userId}:${policy.releaseEpoch}`;
}

function bootstrapAlreadyRan(userId: string, policy: CooperadoReleasePolicy): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(sessionKey(userId, policy)) === "1";
  } catch {
    return false;
  }
}

function markBootstrapRan(userId: string, policy: CooperadoReleasePolicy): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(sessionKey(userId, policy), "1");
  } catch {
    /* quota */
  }
}

function needsSilentBootstrap(
  user: Omit<User, "password">,
  policy: CooperadoReleasePolicy,
  clientBuild: number
): boolean {
  if (!cooperadoClientBuildMeetsMin(clientBuild, policy)) return true;
  if (!cooperadoPostDeployAckMatches(clientBuild, policy.releaseEpoch)) return true;
  if (cooperadoAppReleaseNeedsOperacionalSync()) return true;
  if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return true;
  return false;
}

/** Materializa UI local + ack quando a nuvem já respondeu (não bloqueia tela). */
export async function cooperadoPostDeployMaterializeAfterSync(
  user: Omit<User, "password">,
  policy: CooperadoReleasePolicy
): Promise<void> {
  await waitForAppDataWarm(8_000).catch(() => false);
  if (!isAppDataWarm()) return;
  empacotarModeloAparelhoJeferson(user);
  await persistirHbCreditAccountCooperado(user).catch(() => false);
  if (
    cooperadoGaExibicaoFinanceiraConfiavel(user) ||
    !cooperadoAppReleaseNeedsOperacionalSync()
  ) {
    persistOperacionalSyncedAppBuild();
    markCooperadoPostDeployAck(policy.releaseEpoch, APP_BUILD_VERSION);
    clearCooperadoPostDeployDegraded();
  }
}

function dispatchSilentOperacionalPull(): void {
  markCooperadoPrimeiraCargaSyncPending();
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", {
    force: true,
    immediate: true,
    eventDriven: true,
  });
}

/**
 * Sync pós-release 100% em segundo plano — sem overlay, sem await longo na UI.
 */
export function scheduleCooperadoSilentReleaseBootstrap(
  user: Omit<User, "password"> | null | undefined,
  policy: CooperadoReleasePolicy | null,
  clientBuild: number
): void {
  if (!user || user.role !== "cooperado" || !user.id) return;
  const effective = policy ?? embeddedCooperadoReleasePolicy();
  if (bootstrapAlreadyRan(user.id, effective)) return;
  if (!needsSilentBootstrap(user, effective, clientBuild)) return;

  const run = () => {
    if (!cooperadoClientBuildMeetsMin(clientBuild, effective)) {
      markBootstrapRan(user.id, effective);
      window.location.replace(cooperadoPostDeployReloadHref(effective));
      return;
    }

    markBootstrapRan(user.id, effective);
    setCooperadoPostDeployQueueActive(true);
    dispatchSilentOperacionalPull();
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);

    void cooperadoPostDeployMaterializeAfterSync(user, effective).finally(() => {
      setCooperadoPostDeployQueueActive(false);
    });
  };

  scheduleCooperadoPostInteractiveTask(run);
}

/** Re-materializa após sync silencioso concluir (hook chama quando lastSyncedAt muda). */
export function scheduleCooperadoPostDeployMaterializeOnSync(
  user: Omit<User, "password"> | null | undefined,
  policy: CooperadoReleasePolicy | null
): void {
  if (!user || user.role !== "cooperado") return;
  const effective = policy ?? embeddedCooperadoReleasePolicy();
  if (cooperadoPostDeployAckMatches(APP_BUILD_VERSION, effective.releaseEpoch)) return;

  const run = () => {
    void cooperadoPostDeployMaterializeAfterSync(user, effective);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_000 });
  } else {
    window.setTimeout(run, 300);
  }
}
