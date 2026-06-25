/** Rascunho de fotos em IndexedDB — uma foto por registro (não estoura RAM no celular). */

const DB_NAME = "hb_anexar_fotos_v2";
const STORE_META = "meta";
const STORE_FOTOS = "fotos";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const LEGACY_DB_NAME = "hb_anexar_fotos_v1";
const LEGACY_STORE = "drafts";

interface DraftMeta {
  coopKey: string;
  contratoId: string;
  count: number;
  savedAt: number;
  /** ID estável da entrega — reutilizado em retentativas de envio. */
  pendingNotaId?: string;
}

export interface FotoDraftMetaLoaded {
  contratoId: string;
  count: number;
  pendingNotaId?: string;
}

interface DraftFotoRow {
  key: string;
  coopKey: string;
  index: number;
  preview: string;
  data: string;
}

export interface FotoDraftPreview {
  index: number;
  preview: string;
}

function fotoKey(coopKey: string, index: number): string {
  return `${coopKey}#${index}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "coopKey" });
      }
      if (!db.objectStoreNames.contains(STORE_FOTOS)) {
        const store = db.createObjectStore(STORE_FOTOS, { keyPath: "key" });
        store.createIndex("byCoopKey", "coopKey", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB indisponível."));
  });
}

function txPutMeta(db: IDBDatabase, meta: DraftMeta): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao gravar meta do rascunho."));
    tx.objectStore(STORE_META).put(meta);
  });
}

function txGetMeta(db: IDBDatabase, coopKey: string): Promise<DraftMeta | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao ler meta do rascunho."));
    const req = tx.objectStore(STORE_META).get(coopKey);
    req.onsuccess = () => resolve(req.result as DraftMeta | undefined);
    req.onerror = () => reject(req.error ?? new Error("Erro ao ler meta do rascunho."));
  });
}

function txPutFoto(db: IDBDatabase, row: DraftFotoRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao gravar foto no rascunho."));
    tx.objectStore(STORE_FOTOS).put(row);
  });
}

function txGetFoto(db: IDBDatabase, coopKey: string, index: number): Promise<DraftFotoRow | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOTOS, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao ler foto do rascunho."));
    const req = tx.objectStore(STORE_FOTOS).get(fotoKey(coopKey, index));
    req.onsuccess = () => resolve(req.result as DraftFotoRow | undefined);
    req.onerror = () => reject(req.error ?? new Error("Erro ao ler foto do rascunho."));
  });
}

function txDeleteAllForCoop(db: IDBDatabase, coopKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_META, STORE_FOTOS], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao limpar rascunho."));
    tx.objectStore(STORE_META).delete(coopKey);
    const idx = tx.objectStore(STORE_FOTOS).index("byCoopKey");
    const req = idx.openCursor(IDBKeyRange.only(coopKey));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    req.onerror = () => reject(req.error ?? new Error("Erro ao limpar fotos do rascunho."));
  });
}

async function migrateLegacyDraft(coopKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const legacy = await new Promise<IDBDatabase | null>((resolve) => {
      const req = indexedDB.open(LEGACY_DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!legacy) return;
    const row = await new Promise<{ fotos: string[]; contratoId: string } | undefined>((resolve, reject) => {
      const tx = legacy.transaction(LEGACY_STORE, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(LEGACY_STORE).get(coopKey);
      req.onsuccess = () => resolve(req.result as { fotos: string[]; contratoId: string } | undefined);
      req.onerror = () => reject(req.error);
    });
    legacy.close();
    if (!row?.fotos?.length) return;

    const { makeFotoThumbnail } = await import("@/utils/fotoEntrega");
    for (let i = 0; i < row.fotos.length; i++) {
      const data = row.fotos[i];
      const preview = await makeFotoThumbnail(data, 160, 0.4);
      await appendFotoDraft(coopKey, row.contratoId ?? "", preview, data);
    }
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    /* ignore migration errors */
  }
}

export async function loadFotoDraftMeta(coopKey: string): Promise<FotoDraftMetaLoaded | null> {
  if (typeof indexedDB === "undefined") return null;
  await migrateLegacyDraft(coopKey);
  try {
    const db = await openDb();
    const meta = await txGetMeta(db, coopKey);
    db.close();
    if (!meta?.count) return null;
    if (Date.now() - meta.savedAt > MAX_AGE_MS) {
      await clearFotoDraft(coopKey);
      return null;
    }
    return {
      contratoId: meta.contratoId ?? "",
      count: meta.count,
      pendingNotaId: meta.pendingNotaId,
    };
  } catch {
    return null;
  }
}

/** Gera ou reutiliza o ID da entrega em andamento (evita entregas órfãs ao retentar). */
export async function getOrCreatePendingNotaId(
  coopKey: string,
  factory: () => string
): Promise<string> {
  if (typeof indexedDB === "undefined") return factory();
  const db = await openDb();
  try {
    const prev = await txGetMeta(db, coopKey);
    if (prev?.pendingNotaId) return prev.pendingNotaId;
    const pendingNotaId = factory();
    await txPutMeta(db, {
      coopKey,
      contratoId: prev?.contratoId ?? "",
      count: prev?.count ?? 0,
      savedAt: Date.now(),
      pendingNotaId,
    });
    return pendingNotaId;
  } finally {
    db.close();
  }
}

/** Compatível com código antigo — carrega só metadados (não traz fotos para RAM). */
export async function loadFotoDraft(
  coopKey: string
): Promise<{ fotos: string[]; contratoId: string } | null> {
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta) return null;
  return { fotos: new Array(meta.count).fill(""), contratoId: meta.contratoId };
}

export async function countFotoDraft(coopKey: string): Promise<number> {
  const meta = await loadFotoDraftMeta(coopKey);
  return meta?.count ?? 0;
}

export async function listFotoDraftPreviews(coopKey: string): Promise<FotoDraftPreview[]> {
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta?.count) return [];
  const db = await openDb();
  const previews: FotoDraftPreview[] = [];
  try {
    for (let i = 0; i < meta.count; i++) {
      const row = await txGetFoto(db, coopKey, i);
      if (row?.preview) previews.push({ index: i, preview: row.preview });
    }
  } finally {
    db.close();
  }
  return previews;
}

export async function getFotoDraftData(coopKey: string, index: number): Promise<string | undefined> {
  const db = await openDb();
  try {
    const row = await txGetFoto(db, coopKey, index);
    return row?.data;
  } finally {
    db.close();
  }
}

export async function isFotoDraftDuplicada(coopKey: string, data: string): Promise<boolean> {
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta?.count) return false;
  const db = await openDb();
  try {
    for (let i = 0; i < meta.count; i++) {
      const row = await txGetFoto(db, coopKey, i);
      if (row?.data === data) return true;
    }
    return false;
  } finally {
    db.close();
  }
}

export async function appendFotoDraft(
  coopKey: string,
  contratoId: string,
  preview: string,
  data: string
): Promise<number> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB indisponível.");
  const db = await openDb();
  try {
    const prev = await txGetMeta(db, coopKey);
    const index = prev?.count ?? 0;
    await txPutFoto(db, { key: fotoKey(coopKey, index), coopKey, index, preview, data });
    await txPutMeta(db, {
      coopKey,
      contratoId: contratoId || prev?.contratoId || "",
      count: index + 1,
      savedAt: Date.now(),
      pendingNotaId: prev?.pendingNotaId,
    });
    return index;
  } finally {
    db.close();
  }
}

export async function removeFotoDraftAt(coopKey: string, removeIndex: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta?.count || removeIndex < 0 || removeIndex >= meta.count) return;

  const db = await openDb();
  const rows: DraftFotoRow[] = [];
  try {
    for (let i = 0; i < meta.count; i++) {
      if (i === removeIndex) continue;
      const row = await txGetFoto(db, coopKey, i);
      if (row) rows.push(row);
    }
    await txDeleteAllForCoop(db, coopKey);
  } finally {
    db.close();
  }

  const freshDb = await openDb();
  try {
    for (let i = 0; i < rows.length; i++) {
      const src = rows[i];
      await txPutFoto(freshDb, {
        key: fotoKey(coopKey, i),
        coopKey,
        index: i,
        preview: src.preview,
        data: src.data,
      });
    }
    const fullMeta = await txGetMeta(freshDb, coopKey);
    await txPutMeta(freshDb, {
      coopKey,
      contratoId: meta.contratoId,
      count: rows.length,
      savedAt: Date.now(),
      pendingNotaId: fullMeta?.pendingNotaId,
    });
  } finally {
    freshDb.close();
  }
}

export async function clearFotoDraft(coopKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await txDeleteAllForCoop(db, coopKey);
    db.close();
  } catch {
    /* ignore */
  }
}

/** @deprecated Fotos já são salvas ao adicionar — mantido por compatibilidade. */
export async function saveFotoDraft(
  coopKey: string,
  _fotos: string[],
  contratoId: string
): Promise<boolean> {
  if (_fotos.length === 0) {
    await clearFotoDraft(coopKey);
    return true;
  }
  const meta = await loadFotoDraftMeta(coopKey);
  if (meta && meta.count === _fotos.length) return true;
  return false;
}
