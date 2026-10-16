/**
 * Cooperado mobile + BIC: até 3 sincronizações por sessão (abertura do app),
 * com rematerialização de snapshots a partir da leitura BIC após cada pull.
 */
import type { User } from "@/types";
import { isCooperadoMobileBicLeituraAuthority } from "@/lib/cooperado/cooperadoBicMobileAuthority";
import { cooperadoRematerializarFinanceiroLocalSePossivel } from "@/lib/cooperado/cooperadoPwaFinanceiroSnapshotRefresh";
import { cooperadoPilotForcarRematerializacaoFinanceira } from "@/lib/cooperado/cooperadoMobilePilotFinanceReadRecovery";
import { runCooperadoGaSyncBaseInformacoesFinanceiras } from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import { dispatchCooperadoPwaLeveUiSnapshotRefresh } from "@/lib/cooperado/cooperadoPwaLeveUiEvents";
import { scheduleCooperadoPostInteractiveTask } from "@/lib/performance/cooperadoColdStart";
import { requestCooperadoGaFinanceiroExibicaoRecoverySync } from "@/services/syncRequest";
import {
  isCooperadoBicHybridLightEnabled,
  scheduleCooperadoBicHybridIdleTask,
} from "@/lib/cooperado/cooperadoBicHybridLight";
import { cooperadoGaExibicaoFinanceiraAindaZerada } from "@/lib/cooperado/cooperadoGaExibicaoFinanceiraRecovery";
import {
  awaitCooperadoGaSyncBaseInformacoesFinanceirasInflight,
  isCooperadoGaSyncBaseInformacoesFinanceirasInflight,
} from "@/lib/cooperado/cooperadoGaBaseInformacoesFinanceirasSync";
import {
  markCooperadoBicSessionRematerialized,
  shouldSkipCooperadoBicSessionReinforcementPull,
} from "@/lib/cooperado/cooperadoBicSessionReinforcementSkip";
import {
  cooperadoBrowserDesktopBicPerfActive,
  cooperadoBrowserDesktopFinanceiroEstavel,
} from "@/lib/cooperado/cooperadoBrowserDesktopPerf";
import { cooperadoFinanceiroCardCacheTemValor } from "@/lib/cooperado/cooperadoFinanceiroDisplayCache";

const SESSION_COUNT_PREFIX = "hb.coop.bicMobileSessionSyncCount";
/** 1ª imediata pós-interativo + 2 reforços — sensação “quase ao vivo”. */
const SESSION_SYNC_DELAYS_MS = [0, 8_000, 22_000] as const;
const MAX_SYNCS_PER_SESSION = SESSION_SYNC_DELAYS_MS.length;

let activeUserId: string | null = null;
const timerIds: number[] = [];

function sessionCountKey(userId: string): string {
  return `${SESSION_COUNT_PREFIX}:${userId}`;
}

function readSessionSyncCount(userId: string): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    const n = parseInt(sessionStorage.getItem(sessionCountKey(userId)) ?? "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function incrementSessionSyncCount(userId: string): number {
  const next = readSessionSyncCount(userId) + 1;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(sessionCountKey(userId), String(next));
    } catch {
      /* quota */
    }
  }
  return next;
}

function clearTimers(): void {
  for (const id of timerIds) window.clearTimeout(id);
  timerIds.length = 0;
}

function rematerializarBicSnapshots(user: Omit<User, "password">): void {
  const run = () => {
    cooperadoPilotForcarRematerializacaoFinanceira(user);
    cooperadoRematerializarFinanceiroLocalSePossivel(user);
    dispatchCooperadoPwaLeveUiSnapshotRefresh();
    markCooperadoBicSessionRematerialized(user.id);
  };
  if (isCooperadoBicHybridLightEnabled()) {
    scheduleCooperadoBicHybridIdleTask(run);
  } else {
    run();
  }
}

async function runBicSessionSyncTick(user: Omit<User, "password">, tickIndex: number): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) return;
  if (activeUserId !== user.id) return;
  if (readSessionSyncCount(user.id) >= MAX_SYNCS_PER_SESSION) return;

  const hybridLight = isCooperadoBicHybridLightEnabled();

  if (tickIndex > 0 && isCooperadoGaSyncBaseInformacoesFinanceirasInflight()) {
    incrementSessionSyncCount(user.id);
    await awaitCooperadoGaSyncBaseInformacoesFinanceirasInflight();
    rematerializarBicSnapshots(user);
    return;
  }

  if (tickIndex > 0 && hybridLight && (await shouldSkipCooperadoBicSessionReinforcementPull(user, tickIndex))) {
    incrementSessionSyncCount(user.id);
    rematerializarBicSnapshots(user);
    return;
  }

  incrementSessionSyncCount(user.id);

  if (tickIndex === 0) {
    const desktop = cooperadoBrowserDesktopBicPerfActive(user);
    const cacheValor = desktop && cooperadoFinanceiroCardCacheTemValor(user);
    await runCooperadoGaSyncBaseInformacoesFinanceiras(user, {
      force: !cacheValor,
      bicSession: true,
      light: Boolean(cacheValor),
    });
  } else if (hybridLight) {
    await runCooperadoGaSyncBaseInformacoesFinanceiras(user, { bicSession: true, light: true });
    if (cooperadoGaExibicaoFinanceiraAindaZerada(user)) {
      requestCooperadoGaFinanceiroExibicaoRecoverySync({ garantia: true });
    }
  } else {
    requestCooperadoGaFinanceiroExibicaoRecoverySync({ garantia: true });
    await runCooperadoGaSyncBaseInformacoesFinanceiras(user, { force: true, bicSession: true });
  }
  rematerializarBicSnapshots(user);
}

/**
 * Agenda 3 pulls por sessão de login (cooperado mobile, BIC padrão).
 */
export function scheduleCooperadoBicMobileSessionSync(
  user: Omit<User, "password"> | null | undefined
): void {
  if (typeof window === "undefined") return;
  if (!isCooperadoMobileBicLeituraAuthority(user)) return;

  if (activeUserId === user!.id && timerIds.length > 0) return;

  clearTimers();
  activeUserId = user!.id;

  if (cooperadoBrowserDesktopBicPerfActive(user) && cooperadoBrowserDesktopFinanceiroEstavel(user)) {
    return;
  }

  if (readSessionSyncCount(user!.id) >= MAX_SYNCS_PER_SESSION) {
    rematerializarBicSnapshots(user!);
    return;
  }

  const delays =
    cooperadoBrowserDesktopBicPerfActive(user)
      ? ([0] as const)
      : SESSION_SYNC_DELAYS_MS;

  delays.forEach((delayMs, tickIndex) => {
    const run = () => void runBicSessionSyncTick(user!, tickIndex);
    if (delayMs <= 0) {
      scheduleCooperadoPostInteractiveTask(run);
      return;
    }
    const id = window.setTimeout(run, delayMs);
    timerIds.push(id);
  });
}

export function cancelCooperadoBicMobileSessionSync(): void {
  clearTimers();
  activeUserId = null;
}
