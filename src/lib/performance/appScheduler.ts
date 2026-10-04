/**
 * HX 8.0 — fila de prioridade no client (RQL). Não altera lógica de negócio;
 * sync continua no CooperativaSyncProvider via syncRequest.
 */

import { mergeSyncTierRequests, type SyncTierRequest } from "@/lib/performance/syncTier";

export type AppTaskPriority = 0 | 1 | 2 | 3 | 4 | 5;

export type AppScheduledTask = {
  id: string;
  priority: AppTaskPriority;
  run: () => void;
  label?: string;
};

type SyncDispatch = (opts: { force: boolean; userInitiated?: boolean; eventDriven?: boolean }) => void;

let started = false;
let syncDispatch: SyncDispatch | null = null;
let pendingSync: SyncTierRequest | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let deferTimer: ReturnType<typeof setTimeout> | null = null;

const SYNC_DEBOUNCE_MS = 450;
/** Só usado quando deferSyncDuringInteraction === true (opt-in). */
const INTERACTION_QUIET_MS = 48;

let deferSyncDuringInteraction = false;
let lastInteractionAt = 0;

const taskQueues: Map<AppTaskPriority, AppScheduledTask[]> = new Map([
  [0, []],
  [1, []],
  [2, []],
  [3, []],
  [4, []],
  [5, []],
]);

let flushScheduled = false;

export type AppSchedulerSnapshot = {
  started: boolean;
  deferSyncDuringInteraction: boolean;
  pendingSync: SyncTierRequest | null;
  queueDepth: Record<AppTaskPriority, number>;
  lastInteractionAt: number;
};

function queueDepth(): Record<AppTaskPriority, number> {
  const out: Record<AppTaskPriority, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of [0, 1, 2, 3, 4, 5] as AppTaskPriority[]) {
    out[p] = taskQueues.get(p)?.length ?? 0;
  }
  return out;
}

export function getAppSchedulerSnapshot(): AppSchedulerSnapshot {
  return {
    started,
    deferSyncDuringInteraction,
    pendingSync,
    queueDepth: queueDepth(),
    lastInteractionAt,
  };
}

/** Opt-in via NEXT_PUBLIC_APP_SCHEDULER_DEFER_SYNC=false — default true (sync após troca de aba/rota). */
export function readDeferSyncDuringInteractionFromEnv(): boolean {
  if (typeof process === "undefined") return true;
  const v = (process.env.NEXT_PUBLIC_APP_SCHEDULER_DEFER_SYNC ?? "true").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

export function setDeferSyncDuringInteraction(enabled: boolean): void {
  deferSyncDuringInteraction = enabled;
}

export function markUserInteraction(): void {
  lastInteractionAt = Date.now();
}

export function registerAppSchedulerSyncDispatch(dispatch: SyncDispatch): () => void {
  syncDispatch = dispatch;
  return () => {
    if (syncDispatch === dispatch) syncDispatch = null;
  };
}

function shouldDeferSyncForInteraction(): boolean {
  if (!deferSyncDuringInteraction) return false;
  return Date.now() - lastInteractionAt < INTERACTION_QUIET_MS;
}

function dispatchPendingSyncNow(): void {
  if (!pendingSync) return;
  const { force, userInitiated, eventDriven } = pendingSync;
  pendingSync = null;
  if (deferTimer) {
    clearTimeout(deferTimer);
    deferTimer = null;
  }
  syncDispatch?.({ force, userInitiated, eventDriven });
}

function schedulePendingSyncDispatch(): void {
  if (!pendingSync) return;
  if (!pendingSync.immediate && shouldDeferSyncForInteraction()) {
    if (deferTimer) clearTimeout(deferTimer);
    const wait = INTERACTION_QUIET_MS - (Date.now() - lastInteractionAt);
    deferTimer = setTimeout(() => {
      deferTimer = null;
      schedulePendingSyncDispatch();
    }, Math.max(0, wait));
    return;
  }
  dispatchPendingSyncNow();
}

/**
 * Enfileira intenção de sync global (mesmo debounce/coalescência que syncRequest legado).
 */
export function enqueueAppSyncRequest(request: SyncTierRequest): void {
  markUserInteraction();
  pendingSync = mergeSyncTierRequests(pendingSync, request);

  if (request.immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    schedulePendingSyncDispatch();
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    schedulePendingSyncDispatch();
  }, SYNC_DEBOUNCE_MS);
}

function flushTaskQueues(): void {
  flushScheduled = false;
  for (const p of [0, 1, 2, 3, 4, 5] as AppTaskPriority[]) {
    const q = taskQueues.get(p);
    if (!q?.length) continue;
    while (q.length) {
      const task = q.shift();
      if (!task) break;
      try {
        task.run();
      } catch {
        /* não derrubar o app por tarefa P5 */
      }
    }
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(flushTaskQueues);
}

/** Tarefas genéricas (prefetch, marks, workers futuros). P0–P2 antes de P4 sync. */
export function scheduleAppTask(task: AppScheduledTask): void {
  const q = taskQueues.get(task.priority);
  if (!q) return;
  q.push(task);
  scheduleFlush();
}

export function startAppScheduler(): () => void {
  if (started) return () => {};
  started = true;
  deferSyncDuringInteraction = readDeferSyncDuringInteractionFromEnv();
  return () => {
    started = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (deferTimer) clearTimeout(deferTimer);
    debounceTimer = null;
    deferTimer = null;
    pendingSync = null;
    for (const p of [0, 1, 2, 3, 4, 5] as AppTaskPriority[]) {
      taskQueues.get(p)?.splice(0);
    }
  };
}

/** Testes — não usar em produção. */
export function resetAppSchedulerForTests(): void {
  started = false;
  syncDispatch = null;
  pendingSync = null;
  if (debounceTimer) clearTimeout(debounceTimer);
  if (deferTimer) clearTimeout(deferTimer);
  debounceTimer = null;
  deferTimer = null;
  deferSyncDuringInteraction = false;
  lastInteractionAt = 0;
  for (const p of [0, 1, 2, 3, 4, 5] as AppTaskPriority[]) {
    taskQueues.get(p)?.splice(0);
  }
}
