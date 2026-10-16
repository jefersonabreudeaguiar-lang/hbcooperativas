/**
 * Sincroniza AppData local com a base operacional na nuvem (ficha/pagamentos)
 * e rematerializa A receber + Financeiro via paridade universal.
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoGaExibicaoFinanceiraAindaZerada,
  cooperadoGaValorReceberExibicaoResolvida,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { cooperadoPwaMaterializarSnapshotsFinanceirosPosSync } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoHbCreditLimiteAndAccountWarmup } from "@/lib/cooperado/cooperadoMobilePilotHbCreditWarmup";
import { markCooperadoUserSyncVisible } from "@/lib/performance/cooperadoColdStart";
import { fetchCooperativaCloudRevision } from "@/services/cooperativaSyncRevisionService";
import {
  fingerprintCooperativaCloudRevision,
  persistAppliedCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { runCooperadoNotasContratosLightPull } from "@/lib/cooperado/cooperadoNotasContratosLightPull";
import { resolverCooperadoIdCanonico } from "@/services/cooperadoCloudService";
import { syncOperacionalFromCloud } from "@/services/cooperativaSyncCloudService";
import { getData, isAppDataWarm, preloadAppData, waitForAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { syncNotasPedidoFromCloud } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { cooperadoLeituraFinanceiraExibicao } from "@/lib/cooperado/cooperadoLeituraFinanceiraExibicao";
import { cooperadoMotorTemObrigacaoReceber } from "@/lib/cooperadoInicioCardPolicy";
import { resolverMotorCardInicioParidadeFinanceiro } from "@/lib/cooperado/cooperadoInicioCardParidadeMotor";

const SESSION_KEY = "hb.coop.gaBaseInformacoesPull.v1";
const MIN_INTERVAL_MS = 45_000;

let inflight: Promise<boolean> | null = null;

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
  return !cooperadoGaValorReceberExibicaoResolvida(user) || cooperadoGaExibicaoFinanceiraAindaZerada(user);
}

/** Puxa operacional + notas da nuvem e atualiza snapshots locais (paridade = base). */
export async function runCooperadoGaSyncBaseInformacoesFinanceiras(
  user: Omit<User, "password"> | null | undefined,
  opts?: { force?: boolean }
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!user || user.role !== "cooperado" || !user.cooperadoId) return false;
  if (!isCooperadoMobileGaPromoted(user)) return false;
  if (!opts?.force && !cooperadoGaPrecisaSyncBaseInformacoesFinanceiras(user)) return false;
  if (!opts?.force && pullJaRecente(user.id)) return false;
  if (inflight) return inflight;

  inflight = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    markCooperadoUserSyncVisible();
    preloadAppData();
    const warm = isAppDataWarm() ? true : await waitForAppDataWarm(20_000);
    if (!warm) return false;

    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return false;
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    const digits = normalizeCnpj(cnpj ?? "");
    if (digits.length !== 14) return false;

    markPull(user.id);

    const op = await syncOperacionalFromCloud(digits);
    if (!op.ok) {
      await syncNotasPedidoFromCloud(digits, { retryFull: true }).catch(() => {});
    } else {
      await syncNotasPedidoFromCloud(digits, { retryFull: false }).catch(() => {});
    }

    const remote = await fetchCooperativaCloudRevision(digits);
    if (remote) {
      await runCooperadoNotasContratosLightPull({ cnpj: digits, user, remote }).catch(() => false);
      persistAppliedCooperativaCloudRevision(digits, fingerprintCooperativaCloudRevision(remote));
    }

    cooperadoPwaMaterializarSnapshotsFinanceirosPosSync(user);
    cooperadoPilotForcarRematerializacaoFinanceira(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
    scheduleCooperadoHbCreditLimiteAndAccountWarmup(user);

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
  opts?: { force?: boolean }
): void {
  if (!user || !cooperadoGaPrecisaSyncBaseInformacoesFinanceiras(user) && !opts?.force) return;
  void runCooperadoGaSyncBaseInformacoesFinanceiras(user, opts);
}
