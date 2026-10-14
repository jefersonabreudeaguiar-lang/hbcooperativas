/**
 * Cooperado manual/event-driven: puxa operacional ao abrir ou voltar ao app
 * sem exigir toque em «Atualizar» (sync silencioso em segundo plano).
 */
import { normalizeCnpj } from "@/utils/cooperativa";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";
import {
  cloudRevisionChangedSinceApplied,
  cooperadoOperacionalSyncStale,
  isCooperadoEventDrivenSync,
  readAppliedCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  cooperadoPwaFinanceiroSnapshotsAusentes,
  rematerializarCooperadoPwaSnapshotsSeNecessario,
} from "@/lib/cooperado/cooperadoPwaMessengerSnapshotHydrate";
import {
  cooperadoCloudRevisionNotasInSyncWithApplied,
  clearCooperadoPwaDadosDesatualizados,
  cooperadoPwaSuppressForegroundStaleCheck,
} from "@/lib/cooperado/cooperadoPwaDadosFreshness";
import { persistirCooperadoPwaMessengerCaches } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import { runCooperadoMessengerOperacionalLightPull } from "@/lib/cooperado/cooperadoMessengerOperacionalLightPull";
import {
  requestCooperadoFinanceiroRecoverySync,
  requestCooperadoStaffRevisionSync,
} from "@/services/syncRequest";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { resolveCooperadoForegroundStaleMs } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoGaDeferForegroundRevisionChecks } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { getSession, isAppDataWarm } from "@/services/dataStore";

export type CooperadoForegroundPullReason =
  | "revision_changed"
  | "never_applied_revision"
  | "stale_local_sync"
  | "financeiro_desatualizado"
  | "snapshots_ausentes";

export type CooperadoForegroundPullEvaluation = {
  reason: CooperadoForegroundPullReason;
  remote: CooperativaCloudRevision | null;
};

/** Decide se deve disparar pull silencioso (checagem leve de revisão na nuvem). */
export async function evaluateCooperadoForegroundOperacionalPull(
  cnpj: string | null | undefined,
  opts?: {
    financeiroDesatualizado?: boolean;
    cooperadoId?: string;
    cooperativaId?: string;
  }
): Promise<CooperadoForegroundPullEvaluation | null> {
  if (!isCooperadoEventDrivenSync() || !isCooperadoManualOperacionalSync()) return null;
  const digits = normalizeCnpj(cnpj ?? "");
  if (digits.length !== 14) return null;

  if (opts?.financeiroDesatualizado) {
    return { reason: "financeiro_desatualizado", remote: null };
  }

  if (
    isCooperadoPwaMessengerMode() &&
    opts?.cooperadoId &&
    opts?.cooperativaId &&
    cooperadoPwaFinanceiroSnapshotsAusentes(opts.cooperadoId, opts.cooperativaId)
  ) {
    return { reason: "snapshots_ausentes", remote: null };
  }

  const remote = await fetchCooperativaCloudRevision(digits);
  if (!remote) return null;

  if (cloudRevisionChangedSinceApplied(digits, remote)) {
    return {
      reason: readAppliedCooperativaCloudRevision(digits)
        ? "revision_changed"
        : "never_applied_revision",
      remote,
    };
  }

  if (!isCooperadoPwaMessengerMode()) {
    const sessionUser = getSession();
    const staleMs = resolveCooperadoForegroundStaleMs(sessionUser);
    if (cooperadoOperacionalSyncStale(staleMs)) {
      return { reason: "stale_local_sync", remote };
    }
  }

  return null;
}

export async function runCooperadoForegroundOperacionalCheck(
  cnpj: string | null | undefined,
  opts?: {
    financeiroDesatualizado?: boolean;
    cooperadoId?: string;
    cooperativaId?: string;
  }
): Promise<boolean> {
  const session = getSession();
  if (cooperadoGaDeferForegroundRevisionChecks(session)) return false;
  if (isCooperadoPwaMessengerMode() && cooperadoPwaSuppressForegroundStaleCheck()) {
    return false;
  }

  const evaluation = await evaluateCooperadoForegroundOperacionalPull(cnpj, opts);
  if (!evaluation) return false;

  const digits = normalizeCnpj(cnpj ?? "");
  const { reason, remote } = evaluation;

  if (reason === "financeiro_desatualizado") {
    if (!session || !isCooperadoMobileGaPromoted(session)) {
      requestCooperadoFinanceiroRecoverySync();
    }
    return true;
  }

  if (
    isCooperadoPwaMessengerMode() &&
    reason === "snapshots_ausentes" &&
    isAppDataWarm()
  ) {
    const session = getSession();
    if (session?.role === "cooperado") {
      persistirCooperadoPwaMessengerCaches(session, { light: true });
      if (rematerializarCooperadoPwaSnapshotsSeNecessario(session)) {
        clearCooperadoPwaDadosDesatualizados();
        return true;
      }
      const coopId = opts?.cooperativaId;
      const cooperadoId = opts?.cooperadoId;
      if (
        coopId &&
        cooperadoId &&
        !cooperadoPwaFinanceiroSnapshotsAusentes(cooperadoId, coopId)
      ) {
        clearCooperadoPwaDadosDesatualizados();
        return true;
      }
    }
  }

  if (
    isCooperadoPwaMessengerMode() &&
    reason === "revision_changed" &&
    remote &&
    opts?.cooperativaId &&
    cooperadoCloudRevisionNotasInSyncWithApplied(digits, remote)
  ) {
    const session = getSession();
    if (session?.role === "cooperado") {
      void runCooperadoMessengerOperacionalLightPull({
        cnpj: digits,
        cooperativaId: opts.cooperativaId,
        user: session,
        remote,
      });
      return true;
    }
  }

  if (!session || !isCooperadoMobileGaPromoted(session)) {
    requestCooperadoStaffRevisionSync();
  }
  return true;
}
