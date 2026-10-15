/**
 * GA cooperado — reidrata A receber / Financeiro no aparelho sem sync pesada a cada tick.
 * Escalonamento: 20s → 40s → 1 min (enquanto o app permanece aberto na sessão).
 */
import type { User } from "@/types";
import { isCooperadoMobileGaPromoted } from "@/lib/cooperado/cooperadoMobilePilot";
import {
  cooperadoGaExibicaoFinanceiraAindaZerada,
} from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { requestCooperadoGaFinanceiroExibicaoRecoverySync } from "@/services/syncRequest";

/** Delays absolutos desde o início da sessão visível no app. */
const REFRESH_DELAYS_MS = [20_000, 40_000, 60_000] as const;

let activeUserId: string | null = null;
const timerIds: number[] = [];

function clearRefreshTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds.length = 0;
}

function onRefreshTick(
  user: Omit<User, "password">,
  tickIndex: number,
  isLastTick: boolean
): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (activeUserId !== user.id) return;

  cooperadoPilotForcarRematerializacaoFinanceira(user);

  if (isLastTick && cooperadoGaExibicaoFinanceiraAindaZerada(user)) {
    requestCooperadoGaFinanceiroExibicaoRecoverySync();
  }
}

/**
 * Agenda rematerialização local (+ no máximo uma sync nuvem no 1º minuto) por login/sessão.
 */
export function scheduleCooperadoGaFinanceiroExibicaoRefresh(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (!user || user.role !== "cooperado" || !isCooperadoMobileGaPromoted(user)) return;

  if (activeUserId === user.id && timerIds.length > 0) return;

  clearRefreshTimers();
  activeUserId = user.id;

  REFRESH_DELAYS_MS.forEach((delayMs, index) => {
    const id = window.setTimeout(() => {
      onRefreshTick(user, index, index === REFRESH_DELAYS_MS.length - 1);
    }, delayMs);
    timerIds.push(id);
  });
}

export function cancelCooperadoGaFinanceiroExibicaoRefresh(): void {
  clearRefreshTimers();
  activeUserId = null;
}
