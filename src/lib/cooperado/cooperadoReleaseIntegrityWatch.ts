/**
 * Cooperado GA — vigia integridade de release enquanto o app permanece aberto.
 * Complementa o ClientReleaseShield (foco/rede) e o guard inline de DPL.
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import { cooperadoGaValorReceberExibicaoResolvida } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoAppReleaseNeedsOperacionalSync } from "@/lib/performance/cooperadoEventDrivenSync";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { PWA_RELEASE_INTEGRITY_POLICY } from "@/lib/pwa/pwaReleaseIntegrityStrategy";
import { runClientReleaseIntegrityProbe } from "@/lib/pwa/pwaReleaseIntegrityProbe";

const DELAYS_MS = [...PWA_RELEASE_INTEGRITY_POLICY.cooperadoIntegrityWatchDelaysMs];

let activeUserId: string | null = null;
const timerIds: number[] = [];

function clearWatchTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds.length = 0;
}

function onWatchTick(user: Omit<User, "password">, index: number): void {
  if (typeof document === "undefined" || document.hidden) return;
  if (activeUserId !== user.id) return;
  void runClientReleaseIntegrityProbe(`cooperado_watch_${index}`, {
    bypassCache: index >= DELAYS_MS.length - 2,
    minGapMs: PWA_RELEASE_INTEGRITY_POLICY.integrityProbeMinGapMs,
  });
}

/** Agenda probes escalonados por sessão cooperado (após 1ª interação). */
export function scheduleCooperadoReleaseIntegrityWatch(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;
  if (
    cooperadoGaValorReceberExibicaoResolvida(user) &&
    !cooperadoAppReleaseNeedsOperacionalSync()
  ) {
    return;
  }
  if (activeUserId === user.id && timerIds.length > 0) return;

  clearWatchTimers();
  activeUserId = user.id;

  const arm = () => {
    DELAYS_MS.forEach((delayMs, index) => {
      const id = window.setTimeout(() => onWatchTick(user, index), delayMs);
      timerIds.push(id);
    });
  };

  scheduleCooperadoPostInteractiveTask(arm);
}

export function cancelCooperadoReleaseIntegrityWatch(): void {
  clearWatchTimers();
  activeUserId = null;
}
