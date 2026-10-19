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
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { cooperadoBicAutorizaZerarCardInicio } from "@/lib/cooperadoInicioCardPolicy";
import {
  cooperadoAppReleaseNeedsOperacionalSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { cooperadoPostDeployReloadHref } from "@/lib/cooperado/cooperadoPostDeployQueue";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getData, isAppDataWarm, waitForAppDataWarm } from "@/services/dataStore";
import { getUserCooperativaId } from "@/utils/cooperativa";

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

function cooperadoLiquidadoPeloResponsavel(user: Omit<User, "password">): boolean {
  if (!user.cooperadoId || !isAppDataWarm()) return false;
  const data = getData();
  const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
  if (!coopId) return false;
  const canon = resolverCooperadoIdCanonico(data, user.cooperadoId, coopId);
  return cooperadoBicAutorizaZerarCardInicio(data, canon, coopId);
}

function ackPostDeploySeFinanceiroPronto(
  user: Omit<User, "password">,
  policy: CooperadoReleasePolicy
): boolean {
  if (cooperadoGaExibicaoFinanceiraConfiavel(user) || cooperadoLiquidadoPeloResponsavel(user)) {
    persistOperacionalSyncedAppBuild();
    markCooperadoPostDeployAck(policy.releaseEpoch, APP_BUILD_VERSION);
    clearCooperadoPostDeployDegraded();
    markBootstrapRan(user.id, policy);
    return true;
  }
  return false;
}

/** Materializa UI local + ack só com valor na tela ou liquidação do responsável. */
export async function cooperadoPostDeployMaterializeAfterSync(
  user: Omit<User, "password">,
  policy: CooperadoReleasePolicy
): Promise<void> {
  await waitForAppDataWarm(12_000).catch(() => false);
  if (!isAppDataWarm()) return;
  empacotarModeloAparelhoJeferson(user);
  cooperadoPilotForcarRematerializacaoFinanceira(user);
  dispatchCooperadoPwaLeveUiSnapshotRefresh();
  await persistirHbCreditAccountCooperado(user).catch(() => false);
  ackPostDeploySeFinanceiroPronto(user, policy);
}

let silentReleaseInflight = false;
const SILENT_RELEASE_RETRIES_MS = [8_000, 20_000, 45_000] as const;
const silentReleaseRetryKey = new Set<string>();

/**
 * Cada build novo puxa a ficha da nuvem em segundo plano — todos os cooperados vêem o valor.
 */
export function scheduleCooperadoSilentReleaseBootstrap(
  user: Omit<User, "password"> | null | undefined,
  policy: CooperadoReleasePolicy | null,
  clientBuild: number
): void {
  if (!user || user.role !== "cooperado" || !user.id) return;
  const effective = policy ?? embeddedCooperadoReleasePolicy();
  if (cooperadoPostDeployAckMatches(clientBuild, effective.releaseEpoch)) {
    if (cooperadoGaExibicaoFinanceiraConfiavel(user) || cooperadoLiquidadoPeloResponsavel(user)) {
      return;
    }
  }
  if (bootstrapAlreadyRan(user.id, effective) && cooperadoGaExibicaoFinanceiraConfiavel(user)) {
    return;
  }
  if (!needsSilentBootstrap(user, effective, clientBuild) && cooperadoGaExibicaoFinanceiraConfiavel(user)) {
    return;
  }

  const runOnce = () => {
    if (!cooperadoClientBuildMeetsMin(clientBuild, effective)) {
      window.location.replace(cooperadoPostDeployReloadHref(effective));
      return;
    }
    if (cooperadoLiquidadoPeloResponsavel(user)) {
      ackPostDeploySeFinanceiroPronto(user, effective);
      return;
    }
    if (silentReleaseInflight) return;
    silentReleaseInflight = true;
    setCooperadoPostDeployQueueActive(true);
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    void (async () => {
      await runCooperadoGaSyncBaseInformacoesFinanceiras(user, { force: true, silent: true });
      await cooperadoPostDeployMaterializeAfterSync(user, effective);
    })().finally(() => {
      silentReleaseInflight = false;
      setCooperadoPostDeployQueueActive(false);
    });
  };

  scheduleCooperadoPostInteractiveTask(runOnce);

  const retryKey = `${user.id}:${effective.releaseEpoch}`;
  if (silentReleaseRetryKey.has(retryKey)) return;
  silentReleaseRetryKey.add(retryKey);
  SILENT_RELEASE_RETRIES_MS.forEach((ms) => {
    window.setTimeout(() => {
      if (cooperadoPostDeployAckMatches(clientBuild, effective.releaseEpoch)) {
        if (cooperadoGaExibicaoFinanceiraConfiavel(user) || cooperadoLiquidadoPeloResponsavel(user)) {
          return;
        }
      }
      if (cooperadoGaExibicaoFinanceiraConfiavel(user) || cooperadoLiquidadoPeloResponsavel(user)) {
        ackPostDeploySeFinanceiroPronto(user, effective);
        return;
      }
      runOnce();
    }, ms);
  });
}

/** Re-materializa após sync silencioso concluir (hook chama quando lastSyncedAt muda). */
export function scheduleCooperadoPostDeployMaterializeOnSync(
  user: Omit<User, "password"> | null | undefined,
  policy: CooperadoReleasePolicy | null
): void {
  if (!user || user.role !== "cooperado") return;
  const effective = policy ?? embeddedCooperadoReleasePolicy();
  if (
    cooperadoPostDeployAckMatches(APP_BUILD_VERSION, effective.releaseEpoch) &&
    (cooperadoGaExibicaoFinanceiraConfiavel(user) || cooperadoLiquidadoPeloResponsavel(user))
  ) {
    return;
  }

  const run = () => {
    void cooperadoPostDeployMaterializeAfterSync(user, effective);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2_000 });
  } else {
    window.setTimeout(run, 300);
  }
}
