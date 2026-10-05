import {
  enqueueAppSyncRequest,
  registerAppSchedulerSyncDispatch,
  startAppScheduler,
} from "@/lib/performance/appScheduler";
import {
  cooperadoOperacionalSyncPermitido,
  isCooperadoManualOperacionalSync,
  markCooperadoUserSyncVisible,
  markNextCooperadoSyncSilent,
  takePendingCooperadoSilentSync,
} from "@/lib/performance/cooperadoColdStart";
import {
  grantCooperadoEventDrivenSync,
  isCooperadoEventDrivenSync,
} from "@/lib/performance/cooperadoEventDrivenSync";
import { getSession } from "@/services/dataStore";
import {
  capStaffConferenciaSyncTierRequest,
  shouldBlockStaffAutoSyncDuringConferencia,
} from "@/lib/performance/staffConferenciaSyncTier";
import {
  defaultForceForSyncTier,
  type SyncTier,
} from "@/lib/performance/syncTier";

export type SyncRunOptions = {
  force?: boolean;
  silent?: boolean;
  userInitiated?: boolean;
  eventDriven?: boolean;
  tier?: SyncTier;
};

type SyncHandler = (opts: SyncRunOptions) => void;

let syncHandler: SyncHandler | null = null;
let schedulerBridgeAttached = false;

const SYNC_DEBOUNCE_MS = 450;

function dispatchSync(opts: {
  force: boolean;
  userInitiated?: boolean;
  eventDriven?: boolean;
  tier?: SyncTier;
}): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const silent = takePendingCooperadoSilentSync();
  syncHandler?.({
    force: opts.force,
    silent,
    userInitiated: opts.userInitiated === true,
    eventDriven: opts.eventDriven === true,
    tier: opts.tier,
  });
}

function ensureSchedulerBridge(): void {
  if (schedulerBridgeAttached) return;
  schedulerBridgeAttached = true;
  startAppScheduler();
  registerAppSchedulerSyncDispatch(dispatchSync);
}

/** Registra o handler de sync global (CooperativaSyncProvider). */
export function registerSyncHandler(handler: SyncHandler): () => void {
  ensureSchedulerBridge();
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) syncHandler = null;
  };
}

/**
 * HX 8.0 — pedido de sync por tier (coalescência + debounce no AppScheduler).
 * `force` explícito prevalece; senão usa default do tier.
 */
function cooperadoBloqueiaSyncOperacionalAutomatico(opts?: {
  userInitiated?: boolean;
  eventDriven?: boolean;
}): boolean {
  if (!isCooperadoManualOperacionalSync()) return false;
  const session = getSession();
  if (session?.role !== "cooperado") return false;
  if (opts?.userInitiated || opts?.eventDriven) return false;
  return !cooperadoOperacionalSyncPermitido();
}

export function requestSyncTier(
  tier: SyncTier,
  options?: { force?: boolean; immediate?: boolean; userInitiated?: boolean; eventDriven?: boolean }
): void {
  if (
    !options?.userInitiated &&
    !options?.eventDriven &&
    cooperadoBloqueiaSyncOperacionalAutomatico()
  ) {
    return;
  }
  if (shouldBlockStaffAutoSyncDuringConferencia(options?.userInitiated)) {
    return;
  }
  ensureSchedulerBridge();
  const forceDefault = options?.force ?? defaultForceForSyncTier(tier);
  const capped = capStaffConferenciaSyncTierRequest(
    tier,
    forceDefault,
    options?.userInitiated === true
  );
  enqueueAppSyncRequest({
    tier: capped.tier,
    force: capped.force,
    immediate: options?.immediate,
    userInitiated: options?.userInitiated === true,
    eventDriven: options?.eventDriven === true,
  });
}

/** Sync silenciosa após detectar lançamento do responsável na nuvem. */
export function requestCooperadoStaffRevisionSync(): void {
  if (!isCooperadoEventDrivenSync()) return;
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/** Primeira carga / app novo — uma vez até ter ficha local. */
export function requestCooperadoPrimeiraCargaSync(): void {
  if (!isCooperadoEventDrivenSync()) return;
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/** Nova versão do app publicada — sync operacional única. */
export function requestCooperadoAppReleaseSync(): void {
  if (!isCooperadoEventDrivenSync()) return;
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", { force: true, immediate: true, eventDriven: true });
}

/** Sync leve — HX 8.4: delta de notas (gestão) após conferência/lançamento. */
export function requestAppSyncLight(): void {
  if (cooperadoBloqueiaSyncOperacionalAutomatico()) return;
  requestSyncTier("notas_delta", { force: false });
}

/** Botão Atualizar: força checagem + sync (ação explícita do cooperado). */
export function requestCooperadoManualRefreshSync(): void {
  markCooperadoUserSyncVisible();
  grantCooperadoEventDrivenSync();
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/**
 * Sync após mutação local (staff ou fluxos legados). Não conta como toque em «Atualizar» do cooperado.
 * Cooperado com sync manual: bloqueado aqui — use requestAppSyncImmediate após ação explícita.
 */
export function requestAppSync(): void {
  if (cooperadoBloqueiaSyncOperacionalAutomatico()) return;
  requestSyncTier("operacional_full", { force: true, userInitiated: false });
}

/** Cooperado concluiu envio de entrega — reconcilia fila e puxa status sem exigir «Atualizar». */
export function requestCooperadoPostEntregaSync(): void {
  grantCooperadoEventDrivenSync();
  markNextCooperadoSyncSilent();
  requestSyncTier("operacional_full", {
    force: true,
    immediate: true,
    eventDriven: true,
  });
}

/** Sync imediato — botão “Atualizar agora”. */
export function requestAppSyncImmediate(): void {
  markCooperadoUserSyncVisible();
  requestSyncTier("operacional_full", { force: true, immediate: true, userInitiated: true });
}

/** @internal — compat com testes que importavam debounce constante */
export const SYNC_REQUEST_DEBOUNCE_MS = SYNC_DEBOUNCE_MS;

type VotacaoOperacionalHandler = () => void;

let votacaoOperacionalHandler: VotacaoOperacionalHandler | null = null;

/** Registra pull leve de operacional (pautas/votos) para cooperado. */
export function registerVotacaoOperacionalSyncHandler(handler: VotacaoOperacionalHandler): () => void {
  votacaoOperacionalHandler = handler;
  return () => {
    if (votacaoOperacionalHandler === handler) votacaoOperacionalHandler = null;
  };
}

/** Baixa pautas de votação da nuvem — ignora intervalo de 2 min da sync completa. */
export function requestVotacaoOperacionalSync(): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  votacaoOperacionalHandler?.();
}
