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
  requestCooperadoFinanceiroRecoverySync,
  requestCooperadoStaffRevisionSync,
} from "@/services/syncRequest";

export type CooperadoForegroundPullReason =
  | "revision_changed"
  | "never_applied_revision"
  | "stale_local_sync"
  | "financeiro_desatualizado";

/** Decide se deve disparar pull silencioso (checagem leve de revisão na nuvem). */
export async function evaluateCooperadoForegroundOperacionalPull(
  cnpj: string | null | undefined,
  opts?: { financeiroDesatualizado?: boolean }
): Promise<CooperadoForegroundPullReason | null> {
  if (!isCooperadoEventDrivenSync() || !isCooperadoManualOperacionalSync()) return null;
  const digits = normalizeCnpj(cnpj ?? "");
  if (digits.length !== 14) return null;

  if (opts?.financeiroDesatualizado) return "financeiro_desatualizado";

  const remote = await fetchCooperativaCloudRevision(digits);
  if (!remote) return null;

  if (cloudRevisionChangedSinceApplied(digits, remote)) {
    return readAppliedCooperativaCloudRevision(digits)
      ? "revision_changed"
      : "never_applied_revision";
  }

  if (!isCooperadoPwaMessengerMode() && cooperadoOperacionalSyncStale()) {
    return "stale_local_sync";
  }

  return null;
}

export async function runCooperadoForegroundOperacionalCheck(
  cnpj: string | null | undefined,
  opts?: { financeiroDesatualizado?: boolean }
): Promise<boolean> {
  const reason = await evaluateCooperadoForegroundOperacionalPull(cnpj, opts);
  if (!reason) return false;
  if (reason === "financeiro_desatualizado") {
    requestCooperadoFinanceiroRecoverySync();
    return true;
  }
  requestCooperadoStaffRevisionSync();
  return true;
}
