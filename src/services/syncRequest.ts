type SyncHandler = () => void;

let syncHandler: SyncHandler | null = null;

/** Registra o handler de sync global (CooperativaSyncProvider). */
export function registerSyncHandler(handler: SyncHandler): () => void {
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) syncHandler = null;
  };
}

/** Dispara sync imediato após ação do usuário (salvar, enviar foto, etc.). */
export function requestAppSync(): void {
  syncHandler?.();
}
