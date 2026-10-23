import type { User } from "@/types";
import type { CooperadoReleasePolicy } from "@/lib/cooperado/cooperadoReleasePolicy";
import { cooperadoClientBuildMeetsMin } from "@/lib/cooperado/cooperadoReleasePolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";
import { empacotarModeloAparelhoJeferson } from "@/lib/cooperado/cooperadoAparelhoJefersonPacote";
import {
  cooperadoGaExibicaoFinanceiraConfiavel,
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import {
  cooperadoPostDeployAckMatches,
  clearCooperadoPostDeployDegraded,
  markCooperadoPostDeployAck,
  setCooperadoPostDeployQueueActive,
} from "@/lib/cooperado/cooperadoPostDeploySession";
import { markCooperadoPrimeiraCargaSyncPending } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import {
  grantCooperadoEventDrivenSync,
  persistOperacionalSyncedAppBuild,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { markNextCooperadoSyncSilent } from "@/lib/performance/cooperadoColdStart";
import { requestSyncTier } from "@/services/syncRequest";
import { persistirHbCreditAccountCooperado } from "@/services/hbCreditAccountPersistenciaService";
import { buildCooperadoLoginAbsoluteUrl } from "@/lib/cooperado/cooperadoCanonicalEntryUrl";
import { isAppDataWarm, waitForAppDataWarm } from "@/services/dataStore";

export type PostDeployGatePhase =
  | "idle"
  | "reload_required"
  | "waiting_policy"
  | "sync_operacional"
  | "materializar_ui"
  | "done"
  | "error";

export function cooperadoNeedsPostDeployGate(
  user: Omit<User, "password"> | null | undefined,
  policy: CooperadoReleasePolicy | null,
  clientBuild: number
): boolean {
  if (!user || user.role !== "cooperado") return false;
  if (!policy) return false;
  if (!cooperadoClientBuildMeetsMin(clientBuild, policy)) return true;
  if (!cooperadoPostDeployAckMatches(clientBuild, policy.releaseEpoch)) return true;
  if (cooperadoAppReleaseNeedsOperacionalSync()) return true;
  if (cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)) return true;
  return false;
}

export function cooperadoPostDeployReloadHref(
  policy: CooperadoReleasePolicy,
  origin?: string
): string {
  const build = Math.max(policy.minBuild, policy.recommendedBuild, APP_BUILD_VERSION);
  return buildCooperadoLoginAbsoluteUrl(origin, build);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runCooperadoPostDeployQueue(opts: {
  user: Omit<User, "password">;
  policy: CooperadoReleasePolicy;
  waitForOperacionalSync: () => Promise<boolean>;
  onPhase?: (phase: PostDeployGatePhase) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, policy } = opts;
  setCooperadoPostDeployQueueActive(true);
  try {
    if (
      cooperadoPostDeployAckMatches(APP_BUILD_VERSION, policy.releaseEpoch) &&
      !cooperadoAppReleaseNeedsOperacionalSync() &&
      !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)
    ) {
      persistOperacionalSyncedAppBuild();
      clearCooperadoPostDeployDegraded();
      opts.onPhase?.("done");
      return { ok: true };
    }

    opts.onPhase?.("sync_operacional");
    markCooperadoPrimeiraCargaSyncPending();
    grantCooperadoEventDrivenSync();
    markNextCooperadoSyncSilent();
    requestSyncTier("operacional_full", {
      force: true,
      immediate: true,
      eventDriven: true,
    });

    let synced = await opts.waitForOperacionalSync();
    if (!synced) {
      requestSyncTier("operacional_full", {
        force: true,
        immediate: true,
        eventDriven: true,
      });
      synced = await opts.waitForOperacionalSync();
    }
    if (!synced) {
      return {
        ok: false,
        error: "Não foi possível sincronizar com a cooperativa. Verifique a internet e tente de novo.",
      };
    }

    opts.onPhase?.("materializar_ui");
    await waitForAppDataWarm(20_000);
    if (isAppDataWarm()) {
      empacotarModeloAparelhoJeferson(user);
      await persistirHbCreditAccountCooperado(user).catch(() => false);
    }

    const confiavel = cooperadoGaExibicaoFinanceiraConfiavel(user);
    const aindaPrecisa = cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user);
    if (!confiavel && aindaPrecisa) {
      return {
        ok: false,
        error:
          "Sincronização concluída, mas os valores ainda não aparecem. Toque em Atualizar no topo ou tente novamente.",
      };
    }

    if (confiavel || !cooperadoAppReleaseNeedsOperacionalSync()) {
      persistOperacionalSyncedAppBuild();
    }
    markCooperadoPostDeployAck(policy.releaseEpoch, APP_BUILD_VERSION);
    clearCooperadoPostDeployDegraded();
    opts.onPhase?.("done");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha na atualização." };
  } finally {
    setCooperadoPostDeployQueueActive(false);
  }
}

/** Aguarda sync provider (até maxMs). */
export async function waitForCooperadoSyncSettled(
  read: () => { syncing: boolean; lastSyncedAt: number | null },
  maxMs = 90_000
): Promise<boolean> {
  const start = Date.now();
  const initial = read().lastSyncedAt;
  while (Date.now() - start < maxMs) {
    const { syncing, lastSyncedAt } = read();
    if (!syncing && lastSyncedAt != null && lastSyncedAt !== initial) {
      return true;
    }
    if (!syncing && lastSyncedAt != null && Date.now() - start > 8_000) {
      return true;
    }
    await sleep(500);
  }
  const { syncing, lastSyncedAt } = read();
  return !syncing && lastSyncedAt != null;
}
