/**
 * Sincroniza AppData local com a base operacional na nuvem (ficha/pagamentos)
 * e rematerializa A receber + Financeiro via paridade universal.
 */
import type { User } from "@/types";
import {
  cooperadoGaAberturaBloqueiaPullOperacionalNuvem,
  isCooperadoMobileGaPromoted,
} from "@/lib/cooperado/cooperadoMobilePilot";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import {
  cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { markCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import {
  cloudRevisionChangedSinceApplied,
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import {
  isCooperadoBicHybridLightEnabled,
  scheduleCooperadoBicHybridIdleTask,
} from "@/lib/cooperado/cooperadoBicHybridLight";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { syncOperacionalFromCloud } from "@/services/cooperativaSyncCloudService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { cooperadoGaMobileViewportAtivoLite } from "@/lib/cooperado/cooperadoSessionLite";
import { yieldCooperadoMobileUiBeforeHeavyWork } from "@/lib/cooperado/cooperadoGaMobileAtualizarYield";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoMotorTemObrigacaoReceber } from "@/lib/cooperadoInicioCardPolicy";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";
import {
  cooperadoBrowserDesktopBicPerfActive,
  cooperadoBrowserDesktopFinanceiroEstavel,
} from "@/lib/cooperado/cooperadoBrowserDesktopPerf";
import { cooperadoJefersonBloqueiaSyncAutomatico } from "@/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";

const SESSION_KEY = "hb.coop.gaBaseInformacoesPull.v1";
const MIN_INTERVAL_MS = 45_000;

let inflight: Promise<boolean> | null = null;

export function isCooperadoGaSyncBaseInformacoesFinanceirasInflight(): boolean {
  return inflight != null;
}

export async function awaitCooperadoGaSyncBaseInformacoesFinanceirasInflight(): Promise<void> {
  if (!inflight) return;
  await inflight.catch(() => false);
}

function pullJaRecente(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(`${SESSION_KEY}:${userId}`);
    if (!raw) return false;
    const t = parseInt(raw, 10);
    return Number.isFinite(t) && Date.now() - t < MIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

function markPull(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_KEY}:${userId}`, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function cooperadoGaPrecisaSyncBaseInformacoesFinanceiras(
  user: Omit<User, "password"> | null | undefined
): boolean {
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return false;
  if (cooperadoGaValorReceberExibicaoResolvida(user)) return false;
  return cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user);
}

export type CooperadoGaSyncBaseInformacoesOpts = {
  force?: boolean;
  bicSession?: boolean;
  light?: boolean;
  userInitiated?: boolean;
  /** Pull automático (pós-deploy / recovery) — não marca sync visível na UI. */
  silent?: boolean;
};

function rematerializarAberturaSemPullNuvem(user: Omit<User, "password">): void {
  if (isAppDataWarm()) {
    cooperadoPilotForcarRematerializacaoFinanceira(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
  }
  scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
}

/** Puxa operacional + notas da nuvem e atualiza snapshots locais (paridade = base). */
export async function runCooperadoGaSyncBaseInformacoesFinanceiras(
  user: Omit<User, "password"> | null | undefined,
  opts?: CooperadoGaSyncBaseInformacoesOpts
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (cooperadoJefersonBloqueiaSyncAutomatico(user, opts)) return false;
  if (!isCooperadoMobileGaPromoted(user) && !isCooperadoMobileBicLeituraAuthority(user)) return false;
  if (cooperadoGaAberturaBloqueiaPullOperacionalNuvem(user, opts)) {
    const precisaFichaNuvem =
      Boolean(opts?.force) || cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user);
    if (!precisaFichaNuvem) {
      rematerializarAberturaSemPullNuvem(user);
      return false;
    }
  }
  if (
    !opts?.force &&
    !opts?.bicSession &&
    !cooperadoGaPrecisaSyncBaseInformacoesFinanceiras(user)
  ) {
    return false;
  }
  const lightReconcile =
    Boolean(opts?.light) &&
    Boolean(opts?.bicSession) &&
    isCooperadoBicHybridLightEnabled();
  if (
    !opts?.force &&
    !opts?.bicSession &&
    pullJaRecente(user.id) &&
    !cooperadoGaExibicaoZeradaPrecisaRecoveryNuvem(user)
  ) {
    return false;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    const mobileAtualizar =
      Boolean(opts?.userInitiated) && cooperadoGaMobileViewportAtivoLite();
    if (mobileAtualizar) {
      await yieldCooperadoMobileUiBeforeHeavyWork();
    }
    if (!lightReconcile && !opts?.silent) {
      markCooperadoUserSyncVisible();
    }

    let digits = normalizeCnpj(user.cooperativaCnpj ?? "");
    if (digits.length !== 14) {
      preloadAppData({ userInitiated: Boolean(opts?.userInitiated) });
      const warm = isAppDataWarm() ? true : await waitForAppDataWarm(20_000);
      if (!warm) return false;
      const data = getData();
      const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
      if (!coopId) return false;
      const cnpj = await resolveCooperativaCnpj(data, coopId, user);
      digits = normalizeCnpj(cnpj ?? "");
    } else if (mobileAtualizar && !isAppDataWarm()) {
      const op = await syncOperacionalFromCloud(digits);
      if (!op.ok) {
        await syncNotasPedidoFromCloud(digits, { retryFull: true }).catch(() => {});
      } else {
        await syncNotasPedidoFromCloud(digits, { retryFull: false }).catch(() => {});
      }
      markPull(user.id);
      scheduleCooperadoBicHybridIdleTask(() => {
        if (isAppDataWarm()) {
          cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user, { light: true });
          cooperadoPilotForcarRematerializacaoFinanceira(user);
        }
        dispatchCooperadoPwaLeveUiSnapshotRefresh();
        scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
      }, 1_200);
      return true;
    } else {
      preloadAppData({ userInitiated: Boolean(opts?.userInitiated) });
      const warm = isAppDataWarm() ? true : await waitForAppDataWarm(20_000);
      if (!warm) return false;
    }

    if (digits.length !== 14) return false;

    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return false;

    const remote = await watchBicCooperativaCloudRevision(digits);
    const nuvemMudou = remote ? cloudRevisionChangedSinceApplied(digits, remote) : true;

    if (lightReconcile && remote && !nuvemMudou) {
      return true;
    }

    markPull(user.id);

    if (!lightReconcile || nuvemMudou) {
      const op = await syncOperacionalFromCloud(digits);
      if (!op.ok) {
        await syncNotasPedidoFromCloud(digits, { retryFull: true }).catch(() => {});
      } else {
        await syncNotasPedidoFromCloud(digits, { retryFull: false }).catch(() => {});
      }
    }

    if (remote) {
      persistAppliedCooperativaCloudRevision(digits, fingerprintCooperativaCloudRevision(remote));
    }

    const desktopEstavel = cooperadoBrowserDesktopFinanceiroEstavel(user);
    const materializar = () => {
      if (!desktopEstavel || nuvemMudou) {
        cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user, { light: mobileAtualizar });
        cooperadoPilotForcarRematerializacaoFinanceira(user);
      }
      if (!cooperadoBrowserDesktopBicPerfActive(user) || nuvemMudou) {
        dispatchCooperadoPwaLeveUiSnapshotRefresh();
      }
      scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);
    };
    if (mobileAtualizar) {
      scheduleCooperadoBicHybridIdleTask(materializar, 1_200);
    } else {
      materializar();
    }

    const dataAfter = getData();
    const cooperadoId = user.cooperadoId;
    if (!cooperadoId) return false;
    const canon = resolverCooperadoIdCanonico(dataAfter, cooperadoId, coopId);
    const paridade = cooperadoLeituraFinanceiraExibicao(dataAfter, canon, coopId);
    const { motor } = resolverMotorCardInicioParidadeFinanceiro(dataAfter, canon, coopId);
    return (
      paridade.valorLiquido > 0.005 || cooperadoMotorTemObrigacaoReceber(motor)
    );
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export function scheduleCooperadoGaSyncBaseInformacoesFinanceiras(
  user: Omit<User, "password"> | null | undefined,
  opts?: CooperadoGaSyncBaseInformacoesOpts
): void {
  if (!user || !cooperadoGaPrecisaSyncBaseInformacoesFinanceiras(user) && !opts?.force && !opts?.userInitiated) return;
  void runCooperadoGaSyncBaseInformacoesFinanceiras(user, opts);
}
