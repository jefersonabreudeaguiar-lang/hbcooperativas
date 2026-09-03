type SyncHandler = (force?: boolean) => void;

let syncHandler: SyncHandler | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const SYNC_DEBOUNCE_MS = 450;

function dispatchSync(force: boolean): void {
  if (document.hidden) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncHandler?.(force);
}

/** Registra o handler de sync global (CooperativaSyncProvider). */
export function registerSyncHandler(handler: SyncHandler): () => void {
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) syncHandler = null;
  };
}

/** Dispara sync após ação do usuário (agrupa chamadas rápidas; força atualização). */
export function requestAppSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    dispatchSync(true);
  }, SYNC_DEBOUNCE_MS);
}

/** Sync imediato — botão “Atualizar agora”. */
export function requestAppSyncImmediate(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  dispatchSync(true);
}
