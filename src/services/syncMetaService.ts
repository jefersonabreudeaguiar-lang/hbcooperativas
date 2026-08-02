const SYNC_META_KEY = "hb_sync_meta_v1";
/** Full sync frequente — evita responsável ficar horas sem ver entregas novas. */
const FULL_SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Margem no since (delta) para clock skew client vs SQL updated_at. */
const DELTA_SKEW_MS = 5 * 60 * 1000;

interface CooperativaSyncMeta {
  lastNotasAt?: string;
  lastFullNotasAt?: string;
  /** Watermark do servidor (SQL updated_at), preferido sobre payload.updatedAt. */
  lastServerUpdatedAt?: string;
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
  const meta = readStore().notas[cnpj];
  const cursor = meta?.lastServerUpdatedAt ?? meta?.lastNotasAt;
  if (!cursor) return undefined;
  const t = new Date(cursor).getTime();
  if (!Number.isFinite(t)) return cursor;
  // since com margem — não perde notas se o cursor ficou à frente do SQL.
  return new Date(Math.max(0, t - DELTA_SKEW_MS)).toISOString();
}

export function shouldForceFullNotasSync(cnpj: string): boolean {
  const meta = readStore().notas[cnpj];
  if (!meta?.lastFullNotasAt) return true;
  const elapsed = Date.now() - new Date(meta.lastFullNotasAt).getTime();
  return elapsed >= FULL_SYNC_INTERVAL_MS;
}

/** Próximo sync de notas será full (ex.: abrir Conferir entregas). */
export function forceNextFullNotasSync(cnpj?: string): void {
  const store = readStore();
  if (!cnpj) {
    for (const key of Object.keys(store.notas)) {
      store.notas[key] = { ...store.notas[key], lastFullNotasAt: undefined };
    }
    writeStore(store);
    return;
  }
  const prev = store.notas[cnpj] ?? {};
  store.notas[cnpj] = { ...prev, lastFullNotasAt: undefined };
  writeStore(store);
}

export function markNotasSyncDone(
  cnpj: string,
  full: boolean,
  cloudNotas?: { updatedAt: string; serverUpdatedAt?: string }[],
  serverWatermark?: string
): void {
  const store = readStore();
  const prev = store.notas[cnpj] ?? {};
  let lastNotasAt = prev.lastNotasAt;
  let lastServerUpdatedAt = prev.lastServerUpdatedAt;

  if (serverWatermark) {
    const w = new Date(serverWatermark).getTime();
    const prevW = lastServerUpdatedAt ? new Date(lastServerUpdatedAt).getTime() : 0;
    if (Number.isFinite(w) && w >= prevW) {
      lastServerUpdatedAt = serverWatermark;
      lastNotasAt = serverWatermark;
    }
  }

  if (cloudNotas && cloudNotas.length > 0) {
    const maxServerMs = cloudNotas.reduce((max, nota) => {
      const t = new Date(nota.serverUpdatedAt ?? nota.updatedAt).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (maxServerMs > 0) {
      const maxIso = new Date(maxServerMs).toISOString();
      const prevMs = lastServerUpdatedAt
        ? new Date(lastServerUpdatedAt).getTime()
        : lastNotasAt
          ? new Date(lastNotasAt).getTime()
          : 0;
      if (!lastServerUpdatedAt || maxServerMs > prevMs) {
        lastServerUpdatedAt = maxIso;
        lastNotasAt = maxIso;
      }
    }
  } else if (full) {
    // Lista vazia no full: NÃO avançar cursor para "agora" (isso fazia o próximo
    // delta pular entregas publicadas segundos depois). Só marca full feito.
  }

  const now = new Date().toISOString();
  store.notas[cnpj] = {
    ...prev,
    lastNotasAt: lastNotasAt ?? prev.lastNotasAt,
    lastServerUpdatedAt: lastServerUpdatedAt ?? prev.lastServerUpdatedAt,
    // Só marca full concluído quando full=true — não inventar lastFullNotasAt em delta.
    lastFullNotasAt: full ? now : prev.lastFullNotasAt,
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
