import {
  enqueueAppSyncRequest,
  registerAppSchedulerSyncDispatch,
  startAppScheduler,
} from "@/lib/performance/appScheduler";
import {
  defaultForceForSyncTier,
  type SyncTier,
} from "@/lib/performance/syncTier";

type SyncHandler = (force?: boolean) => void;

let syncHandler: SyncHandler | null = null;
let schedulerBridgeAttached = false;

const SYNC_DEBOUNCE_MS = 450;

function dispatchSync(force: boolean): void {
  if (typeof document !== "undefined" && document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncHandler?.(force);
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
export function requestSyncTier(
  tier: SyncTier,
  options?: { force?: boolean; immediate?: boolean }
): void {
  ensureSchedulerBridge();
  const force = options?.force ?? defaultForceForSyncTier(tier);
  enqueueAppSyncRequest({
    tier,
    force,
    immediate: options?.immediate,
  });
}

/** Sync leve (respeita intervalo mínimo; pull sem push autoritativo na gestão). */
export function requestAppSyncLight(): void {
  requestSyncTier("pulse", { force: false });
}

/** Dispara sync após ação do usuário (agrupa chamadas rápidas; força atualização). */
export function requestAppSync(): void {
  requestSyncTier("operacional_full", { force: true });
}

/** Sync imediato — botão “Atualizar agora”. */
export function requestAppSyncImmediate(): void {
  requestSyncTier("operacional_full", { force: true, immediate: true });
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
