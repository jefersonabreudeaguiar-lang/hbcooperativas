const SYNC_META_KEY = "hb_sync_meta_v1";
const FULL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

interface CooperativaSyncMeta {
  lastNotasAt?: string;
  lastFullNotasAt?: string;
}

interface SyncMetaStore {
  notas: Record<string, CooperativaSyncMeta>;
}

function readStore(): SyncMetaStore {
  if (typeof localStorage === "undefined") return { notas: {} };
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { notas: {} };
    const parsed = JSON.parse(raw) as SyncMetaStore;
    return parsed?.notas ? parsed : { notas: {} };
  } catch {
    return { notas: {} };
  }
}

function writeStore(store: SyncMetaStore): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function getLastNotasSyncAt(cnpj: string): string | undefined {
  return readStore().notas[cnpj]?.lastNotasAt;
}

export function shouldForceFullNotasSync(cnpj: string): boolean {
  const meta = readStore().notas[cnpj];
  if (!meta?.lastFullNotasAt) return true;
  const elapsed = Date.now() - new Date(meta.lastFullNotasAt).getTime();
  return elapsed >= FULL_SYNC_INTERVAL_MS;
}

export function markNotasSyncDone(cnpj: string, full: boolean): void {
  const store = readStore();
  const now = new Date().toISOString();
  const prev = store.notas[cnpj] ?? {};
  store.notas[cnpj] = {
    ...prev,
    lastNotasAt: now,
    lastFullNotasAt: full ? now : prev.lastFullNotasAt ?? now,
  };
  writeStore(store);
}

export function clearNotasSyncMeta(cnpj?: string): void {
  if (!cnpj) {
    writeStore({ notas: {} });
    return;
  }
  const store = readStore();
  delete store.notas[cnpj];
  writeStore(store);
}
