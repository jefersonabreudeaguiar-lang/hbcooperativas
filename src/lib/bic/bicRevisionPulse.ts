/**
 * Concerto BIC — Movimento IV: pulso de revisão (sem payload operacional) + reação única.
 */
import type { User } from "@/types";
import { isBicRevisionPulseEnabled } from "@/lib/bic/bicParidadeHealth";
import { recordBicParidadePulse } from "@/lib/bic/bicParidadeTelemetry";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { markCooperadoBicSessionRematerialized } from "@/lib/cooperado/cooperadoBicSessionReinforcementSkip";
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import {
  cloudRevisionChangedSinceApplied,
  fingerprintCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { scheduleCooperadoBicHybridIdleTask } from "@/lib/cooperado/cooperadoBicHybridLight";
import { markCooperadoBicFinanceiroFresh } from "@/lib/bic/cooperadoBicSonataSyncUi";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

const PULSE_INTERVAL_MS = 55_000;
const MIN_GAP_MS = 42_000;

let activeUserId: string | null = null;
let timerId: number | null = null;
let lastPulseAt = 0;
let inflight = false;

function rematerializarSilencioso(user: Omit<User, "password">): void {
  const run = () => {
    cooperadoPilotForcarRematerializacaoFinanceira(user);
    cooperadoRematerializarFinanceiroLocalSePossivel(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
    markCooperadoBicSessionRematerialized(user.id);
    markCooperadoBicFinanceiroFresh();
  };
  scheduleCooperadoBicHybridIdleTask(run);
}

async function runRevisionPulse(user: Omit<User, "password">): Promise<void> {
  if (inflight) return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (Date.now() - lastPulseAt < MIN_GAP_MS) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (!isAppDataWarm()) return;

  inflight = true;
  lastPulseAt = Date.now();
  try {
    const data = getData();
    const coopId = getUserCooperativaId(user, data) ?? user.cooperativaId;
    if (!coopId) return;
    const cnpj = await resolveCooperativaCnpj(data, coopId, user);
    const digits = normalizeCnpj(cnpj ?? "");
    if (digits.length !== 14) return;

    const remote = await watchBicCooperativaCloudRevision(digits);
    if (!remote) return;

    const changed = cloudRevisionChangedSinceApplied(digits, remote);
    if (changed) {
      recordBicParidadePulse("lightPull");
      await runCooperadoGaSyncBaseInformacoesFinanceiras(user, {
        bicSession: true,
        light: true,
      });
      rematerializarSilencioso(user);
      markCooperadoBicFinanceiroFresh();
      return;
    }

    recordBicParidadePulse("rematerializeOnly");
    rematerializarSilencioso(user);
  } finally {
    inflight = false;
  }
}

function onVisibility(user: Omit<User, "password">): void {
  if (document.visibilityState !== "visible") return;
  void runRevisionPulse(user);
}

export function scheduleCooperadoBicRevisionPulse(
  user: Omit<User, "password"> | null | undefined
): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (!isBicRevisionPulseEnabled()) return () => undefined;
  if (!isCooperadoMobileBicLeituraAuthority(user)) return () => undefined;

  if (activeUserId === user!.id && timerId != null) {
    return cancelCooperadoBicRevisionPulse;
  }

  cancelCooperadoBicRevisionPulse();
  activeUserId = user!.id;

  const tick = () => void runRevisionPulse(user!);
  timerId = window.setInterval(tick, PULSE_INTERVAL_MS);

  const vis = () => onVisibility(user!);
  document.addEventListener("visibilitychange", vis);
  scheduleCooperadoBicHybridIdleTask(tick, 2_500);

  return () => {
    document.removeEventListener("visibilitychange", vis);
    cancelCooperadoBicRevisionPulse();
  };
}

export function cancelCooperadoBicRevisionPulse(): void {
  if (timerId != null) {
    window.clearInterval(timerId);
    timerId = null;
  }
  activeUserId = null;
}

/** Testes — fingerprint estável. */
export function bicRevisionPulseFingerprintForTests(rev: {
  operacionalUpdatedAt: string | null;
  operationalResetVersion: number;
  contratosUpdatedAt: string | null;
  notasUpdatedAt: string | null;
}): string {
  return fingerprintCooperativaCloudRevision(rev);
}
