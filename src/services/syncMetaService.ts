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

export function markNotasSyncDone(
  cnpj: string,
  full: boolean,
  cloudNotas?: { updatedAt: string }[]
): void {
  const store = readStore();
  const prev = store.notas[cnpj] ?? {};
  let lastNotasAt = prev.lastNotasAt;

  if (cloudNotas && cloudNotas.length > 0) {
    const maxCloudMs = cloudNotas.reduce((max, nota) => {
      const t = new Date(nota.updatedAt).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (maxCloudMs > 0) {
      const maxIso = new Date(maxCloudMs).toISOString();
      const prevMs = lastNotasAt ? new Date(lastNotasAt).getTime() : 0;
      if (!lastNotasAt || maxCloudMs > prevMs) {
        lastNotasAt = maxIso;
      }
    }
  } else if (full) {
    lastNotasAt = new Date().toISOString();
  }

  const now = new Date().toISOString();
  store.notas[cnpj] = {
    ...prev,
    lastNotasAt: lastNotasAt ?? prev.lastNotasAt,
    lastFullNotasAt: full ? (lastNotasAt ?? now) : prev.lastFullNotasAt ?? now,
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
