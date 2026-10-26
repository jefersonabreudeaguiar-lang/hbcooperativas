/**
 * Concerto BIC — Movimento IV: pulso de revisão (sem payload operacional) + reação única.
 */
import type { User } from "@/types";
import { isBicRevisionPulseEnabled } from "@/lib/bic/bicParidadeHealth";
import { recordBicParidadePulse } from "@/lib/bic/bicParidadeTelemetry";
import { watchBicCooperativaCloudRevision } from "@/lib/bic/bicRevisionWatch";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { markCooperadoBicSessionRematerialized } from "@/lib/cooperado/cooperadoBicSessionReinforcementSkip";
import { requestCooperadoStaffRevisionSync } from "@/services/syncRequest";
import {
  rematerializarCooperadoValorCardLeve,
  scheduleCooperadoGaValorRevisionLightSync,
} from "@/lib/cooperado/cooperadoGaRevisionLightSync";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cloudRevisionChangedSinceApplied,
  fingerprintCooperativaCloudRevision,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { scheduleCooperadoBicHybridIdleTask } from "@/lib/cooperado/cooperadoBicHybridLight";
import {
  cooperadoBrowserDesktopBicPerfActive,
  cooperadoBrowserDesktopFinanceiroEstavel,
} from "@/lib/cooperado/cooperadoBrowserDesktopPerf";
import { markCooperadoBicFinanceiroFresh } from "@/lib/bic/cooperadoBicSonataSyncUi";
import { cooperadoGaPausaPulsoBicOuRematerializacao } from "@/lib/cooperado/cooperadoGaPausaTrabalhoPesado";
import { cooperadoInicioAberturaQuiescenceActive } from "@/lib/cooperado/cooperadoInicioAberturaQuiescence";
import { cooperadoMobileUiQuiescenceActive } from "@/lib/cooperado/cooperadoTabSwitchQuiescence";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";

const PULSE_INTERVAL_MS_MOBILE = 55_000;
const PULSE_INTERVAL_MS_DESKTOP = 180_000;
const MIN_GAP_MS_MOBILE = 42_000;
const MIN_GAP_MS_DESKTOP = 90_000;

let activeUserId: string | null = null;
let timerId: number | null = null;
let lastPulseAt = 0;
let inflight = false;

function rematerializarSilencioso(user: Omit<User, "password">): void {
  const run = () => {
    rematerializarCooperadoValorCardLeve(user);
    markCooperadoBicSessionRematerialized(user.id);
    markCooperadoBicFinanceiroFresh();
  };
  scheduleCooperadoBicHybridIdleTask(run);
}

function pulseMinGapMs(user: Omit<User, "password">): number {
  return cooperadoBrowserDesktopBicPerfActive(user) ? MIN_GAP_MS_DESKTOP : MIN_GAP_MS_MOBILE;
}

function pulseIntervalMs(user: Omit<User, "password">): number {
  return cooperadoBrowserDesktopBicPerfActive(user)
    ? PULSE_INTERVAL_MS_DESKTOP
    : PULSE_INTERVAL_MS_MOBILE;
}

async function runRevisionPulse(user: Omit<User, "password">): Promise<void> {
  if (inflight) return;
  if (typeof document !== "undefined" && document.hidden) return;
  if (cooperadoInicioAberturaQuiescenceActive()) return;
  if (cooperadoMobileUiQuiescenceActive()) return;
  if (Date.now() - lastPulseAt < pulseMinGapMs(user)) return;
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
      recordBicParidadePulse("operacionalEvent");
      if (isCooperadoMobileGaPromoted(user)) {
        if (cooperadoMobileUiQuiescenceActive()) {
          scheduleCooperadoBicHybridIdleTask(
            () => scheduleCooperadoGaValorRevisionLightSync(user),
            6_000
          );
        } else {
          scheduleCooperadoGaValorRevisionLightSync(user);
        }
      } else {
        requestCooperadoStaffRevisionSync();
        rematerializarSilencioso(user);
      }
      markCooperadoBicFinanceiroFresh();
      return;
    }

    if (cooperadoGaPausaPulsoBicOuRematerializacao(user)) return;

    if (cooperadoBrowserDesktopBicPerfActive(user)) {
      if (!cooperadoBrowserDesktopFinanceiroEstavel(user)) {
        recordBicParidadePulse("rematerializeOnly");
        rematerializarSilencioso(user);
      }
      return;
    }
    // Mobile: revisão igual — não rematerializar em loop (~55s); só quando a nuvem mudar.
    return;
  } finally {
    inflight = false;
  }
}

function onVisibility(user: Omit<User, "password">): void {
  if (document.visibilityState !== "visible") return;
  if (cooperadoInicioAberturaQuiescenceActive()) return;
  /** Checagem de revisão na nuvem é leve — não bloquear quando o card já tem valor (pause só dentro do pulse). */
  scheduleCooperadoBicHybridIdleTask(() => void runRevisionPulse(user), 2_000);
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
  timerId = window.setInterval(tick, pulseIntervalMs(user!));

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
