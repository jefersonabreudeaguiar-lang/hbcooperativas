/**
 * Cooperado manual/event-driven: puxa operacional ao abrir ou voltar ao app
 * sem exigir toque em «Atualizar» (sync silencioso em segundo plano).
 */
import { normalizeCnpj } from "@/utils/cooperativa";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import {
  cloudRevisionChangedSinceApplied,
  cooperadoOperacionalSyncStale,
  isCooperadoEventDrivenSync,
  readAppliedCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { isCooperadoManualOperacionalSync } from "@/lib/performance/cooperadoColdStart";
import { isCooperadoPwaMessengerMode } from "@/lib/cooperado/cooperadoPwaMessengerMode";
import {
  cooperadoPwaFichaParidadeSnapshotDivergeDeAppData,
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
import { runCooperadoNotasContratosLightPull } from "@/lib/cooperado/cooperadoNotasContratosLightPull";
import {
  cooperadoGaExibicaoFinanceiraAindaZerada,
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoGaDispatchPrimeiraCargaSilenciosa } from "@/lib/cooperado/cooperadoGaColdBootstrap";
import {
  requestCooperadoFinanceiroRecoverySync,
  requestCooperadoGaFinanceiroExibicaoRecoverySync,
  requestCooperadoStaffRevisionSync,
} from "@/services/syncRequest";
import type { CooperativaCloudRevision } from "@/lib/performance/cooperadoEventDrivenSync";
import { resolveCooperadoForegroundStaleMs } from "@/lib/cooperado/cooperadoMobilePilotPerf";
import { cooperadoGaDeferForegroundRevisionChecks } from "@/lib/cooperado/cooperadoGaSyncPolicy";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoFinanceiroStaleRecuperavelEmBackground,
  cooperadoTemConferidaAguardandoFicha,
} from "@/services/fichaSyncGuard";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { cooperadoTemDadosFinanceirosMinimos } from "@/lib/cooperado/cooperadoTemDadosFinanceirosMinimos";
import { getData, getSession, isAppDataWarm } from "@/services/dataStore";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { cooperadoGaPausaTrabalhoFinanceiroPesado } from "@/lib/cooperado/cooperadoGaPausaTrabalhoPesado";

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
    if (opts?.cooperadoId && opts?.cooperativaId && isAppDataWarm()) {
      if (
        cooperadoFinanceiroStaleRecuperavelEmBackground(
          getData(),
          opts.cooperadoId,
          opts.cooperativaId
        )
      ) {
        const session = getSession();
        if (session?.role === "cooperado") {
          rematerializarCooperadoPwaSnapshotsSeNecessario(session);
          cooperadoRematerializarFinanceiroLocalSePossivel(session);
        }
        return null;
      }
    }
    return { reason: "financeiro_desatualizado", remote: null };
  }

  if (isCooperadoPwaMessengerMode() && opts?.cooperadoId && opts?.cooperativaId) {
    if (cooperadoPwaFinanceiroSnapshotsAusentes(opts.cooperadoId, opts.cooperativaId)) {
      const session = getSession();
      if (session?.role === "cooperado") {
        rematerializarCooperadoPwaSnapshotsSeNecessario(session);
        cooperadoRematerializarFinanceiroLocalSePossivel(session);
      }
      if (
        isAppDataWarm() &&
        cooperadoTemDadosFinanceirosMinimos(getData(), opts.cooperadoId, opts.cooperativaId)
      ) {
        return null;
      }
      return { reason: "snapshots_ausentes", remote: null };
    }
    const gaUser = getSession();
    if (
      gaUser &&
      isCooperadoMobileGaPromoted(gaUser) &&
      cooperadoGaExibicaoFinanceiraAindaZerada(gaUser)
    ) {
      if (isAppDataWarm() && opts.cooperadoId && opts.cooperativaId) {
        const dataGa = getData();
        const canon = resolverCooperadoIdCanonico(dataGa, opts.cooperadoId, opts.cooperativaId);
        if (cooperadoTemDadosFinanceirosMinimos(dataGa, canon, opts.cooperativaId)) {
          rematerializarCooperadoPwaSnapshotsSeNecessario(gaUser);
          cooperadoRematerializarFinanceiroLocalSePossivel(gaUser);
          return null;
        }
      }
      return { reason: "snapshots_ausentes", remote: null };
    }
    if (isAppDataWarm()) {
      const data = getData();
      if (
        cooperadoPwaFichaParidadeSnapshotDivergeDeAppData(
          data,
          opts.cooperadoId,
          opts.cooperativaId
        )
      ) {
        const session = getSession();
        if (session?.role === "cooperado") {
          rematerializarCooperadoPwaSnapshotsSeNecessario(session);
        }
        return null;
      }
    }
  }

  const remote = await watchBicCooperativaCloudRevision(digits);
  if (!remote) return null;

  if (cloudRevisionChangedSinceApplied(digits, remote)) {
    return {
      reason: readAppliedCooperativaCloudRevision(digits)
        ? "revision_changed"
        : "never_applied_revision",
      remote,
    };
  }

  if (
    isCooperadoPwaMessengerMode() &&
    opts?.cooperadoId &&
    opts?.cooperativaId &&
    isAppDataWarm() &&
    cooperadoTemConferidaAguardandoFicha(getData(), opts.cooperadoId, opts.cooperativaId)
  ) {
    return { reason: "revision_changed", remote };
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
  if (
    session?.role === "cooperado" &&
    cooperadoGaPausaTrabalhoFinanceiroPesado(session) &&
    !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(session)
  ) {
    if (opts?.financeiroDesatualizado) {
      cooperadoRematerializarFinanceiroLocalSePossivel(session);
    }
    return false;
  }
  if (isCooperadoPwaMessengerMode() && cooperadoPwaSuppressForegroundStaleCheck()) {
    return false;
  }

  const data = isAppDataWarm() ? getData() : null;
  const cooperativaId =
    opts?.cooperativaId ??
    (session && data ? getUserCooperativaId(session, data) : undefined) ??
    session?.cooperativaId;
  const cooperadoId = opts?.cooperadoId ?? session?.cooperadoId;
  const evaluation = await evaluateCooperadoForegroundOperacionalPull(cnpj, {
    ...opts,
    cooperadoId,
    cooperativaId,
  });
  if (!evaluation) return false;

  const digits = normalizeCnpj(cnpj ?? "");
  const { reason, remote } = evaluation;
  const deferFull = cooperadoGaDeferForegroundRevisionChecks(session);

  if (reason === "financeiro_desatualizado") {
    if (session?.role === "cooperado" && cooperativaId && isCooperadoPwaMessengerMode()) {
      const rev = remote ?? (await watchBicCooperativaCloudRevision(digits));
      if (rev) {
        void runCooperadoMessengerOperacionalLightPull({
          cnpj: digits,
          cooperativaId,
          user: session,
          remote: rev,
        });
        return true;
      }
    }
    if (deferFull) return false;
    if (session && isCooperadoMobileGaPromoted(session)) {
      requestCooperadoGaFinanceiroExibicaoRecoverySync({ garantia: true });
      cooperadoGaDispatchPrimeiraCargaSilenciosa(session, { allowRepeat: true });
    } else {
      requestCooperadoFinanceiroRecoverySync();
    }
    return true;
  }

  if (
    isCooperadoPwaMessengerMode() &&
    reason === "snapshots_ausentes" &&
    isAppDataWarm()
  ) {
    if (session?.role === "cooperado") {
      persistirCooperadoPwaMessengerCaches(session, { light: true });
      if (rematerializarCooperadoPwaSnapshotsSeNecessario(session)) {
        clearCooperadoPwaDadosDesatualizados();
        return true;
      }
      if (
        cooperativaId &&
        cooperadoId &&
        !cooperadoPwaFinanceiroSnapshotsAusentes(cooperadoId, cooperativaId)
      ) {
        clearCooperadoPwaDadosDesatualizados();
        return true;
      }
      if (deferFull) return false;
      if (isCooperadoMobileGaPromoted(session) && cooperadoGaExibicaoFinanceiraAindaZerada(session)) {
        requestCooperadoGaFinanceiroExibicaoRecoverySync({ garantia: true });
        cooperadoGaDispatchPrimeiraCargaSilenciosa(session, { allowRepeat: true });
        return true;
      }
    }
  }

  if (
    isCooperadoPwaMessengerMode() &&
    reason === "revision_changed" &&
    remote &&
    cooperativaId &&
    cooperadoCloudRevisionNotasInSyncWithApplied(digits, remote)
  ) {
    if (session?.role === "cooperado") {
      void runCooperadoMessengerOperacionalLightPull({
        cnpj: digits,
        cooperativaId,
        user: session,
        remote,
      });
      return true;
    }
  }

  const notasAlteradasNaNuvem =
    reason === "revision_changed" &&
    remote != null &&
    !cooperadoCloudRevisionNotasInSyncWithApplied(digits, remote);

  if (session?.role === "cooperado" && isCooperadoMobileGaPromoted(session)) {
    if (notasAlteradasNaNuvem && remote) {
      void runCooperadoNotasContratosLightPull({
        cnpj: digits,
        user: session,
        remote,
      });
    }
    return true;
  }

  if (deferFull) return false;

  if (
    notasAlteradasNaNuvem ||
    reason === "never_applied_revision" ||
    reason === "stale_local_sync"
  ) {
    requestCooperadoStaffRevisionSync();
  }
  return true;
}
