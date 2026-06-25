/** Rascunho de fotos — só metadados no aparelho (fotos ficam na nuvem). */

const DB_NAME = "hb_anexar_fotos_v3";
const STORE_META = "meta";
const STORE_FOTOS = "fotos";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface DraftMeta {
  coopKey: string;
  contratoId: string;
  count: number;
  savedAt: number;
  pendingNotaId?: string;
  numeroNota?: string;
  createdAt?: string;
  mesReferencia?: string;
}

export interface DraftNotaIdentity {
  numeroNota: string;
  createdAt: string;
  mesReferencia: string;
}

export interface FotoDraftMetaLoaded {
  contratoId: string;
  count: number;
  pendingNotaId?: string;
  uploadedCount?: number;
  numeroNota?: string;
  createdAt?: string;
  mesReferencia?: string;
}

interface DraftFotoRow {
  key: string;
  coopKey: string;
  index: number;
  fingerprint: string;
  uploaded: boolean;
}

export interface FotoDraftPreview {
  index: number;
  preview: string;
}

function fotoKey(coopKey: string, index: number): string {
  return `${coopKey}#${index}`;
}

/** Hash leve para deduplicar sem guardar a imagem inteira. */
export function fingerprintFoto(dataUrl: string): string {
  let h = 2166136261;
  const sample =
    dataUrl.length > 8192 ? dataUrl.slice(0, 4096) + dataUrl.slice(-4096) : dataUrl;
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
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

export async function loadFotoDraftMeta(coopKey: string): Promise<FotoDraftMetaLoaded | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const meta = await txGetMeta(db, coopKey);
    if (!meta?.count) {
      db.close();
      return null;
    }
    let uploadedCount = 0;
    for (let i = 0; i < meta.count; i++) {
      const row = await txGetFoto(db, coopKey, i);
      if (row?.uploaded) uploadedCount += 1;
    }
    db.close();
    if (Date.now() - meta.savedAt > MAX_AGE_MS) {
      await clearFotoDraft(coopKey);
      return null;
    }
    return {
      contratoId: meta.contratoId ?? "",
      count: meta.count,
      pendingNotaId: meta.pendingNotaId,
      uploadedCount,
      numeroNota: meta.numeroNota,
      createdAt: meta.createdAt,
      mesReferencia: meta.mesReferencia,
    };
  } catch {
    return null;
  }
}

export async function saveDraftNotaIdentity(
  coopKey: string,
  identity: DraftNotaIdentity
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const prev = await txGetMeta(db, coopKey);
    await txPutMeta(db, {
      coopKey,
      contratoId: prev?.contratoId ?? "",
      count: prev?.count ?? 0,
      savedAt: Date.now(),
      pendingNotaId: prev?.pendingNotaId,
      numeroNota: identity.numeroNota,
      createdAt: identity.createdAt,
      mesReferencia: identity.mesReferencia,
    });
  } finally {
    db.close();
  }
}

export async function getDraftNotaIdentity(coopKey: string): Promise<DraftNotaIdentity | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const meta = await txGetMeta(db, coopKey);
    db.close();
    if (!meta?.numeroNota || !meta.createdAt || !meta.mesReferencia) return null;
    return {
      numeroNota: meta.numeroNota,
      createdAt: meta.createdAt,
      mesReferencia: meta.mesReferencia,
    };
  } catch {
    return null;
  }
}

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

export async function countFotosUploadedDraft(coopKey: string): Promise<number> {
  const meta = await loadFotoDraftMeta(coopKey);
  return meta?.uploadedCount ?? 0;
}

/** Compatível — não carrega miniaturas (fotos estão na nuvem). */
export async function listFotoDraftPreviews(coopKey: string): Promise<FotoDraftPreview[]> {
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta?.count) return [];
  return Array.from({ length: meta.count }, (_, index) => ({ index, preview: "" }));
}

/** Fotos não ficam no aparelho — sempre undefined. */
export async function getFotoDraftData(_coopKey: string, _index: number): Promise<string | undefined> {
  return undefined;
}

export async function isFotoDraftDuplicada(coopKey: string, dataUrl: string): Promise<boolean> {
  return isFotoDraftDuplicadaByFingerprint(coopKey, fingerprintFoto(dataUrl));
}

export async function isFotoDraftDuplicadaByFingerprint(
  coopKey: string,
  fingerprint: string
): Promise<boolean> {
  const meta = await loadFotoDraftMeta(coopKey);
  if (!meta?.count) return false;
  const db = await openDb();
  try {
    for (let i = 0; i < meta.count; i++) {
      const row = await txGetFoto(db, coopKey, i);
      if (row?.fingerprint === fingerprint) return true;
    }
    return false;
  } finally {
    db.close();
  }
}

export async function appendFotoDraftMeta(
  coopKey: string,
  contratoId: string,
  fingerprint: string
): Promise<number> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB indisponível.");
  const db = await openDb();
  try {
    const prev = await txGetMeta(db, coopKey);
    const index = prev?.count ?? 0;
    await txPutFoto(db, {
      key: fotoKey(coopKey, index),
      coopKey,
      index,
      fingerprint,
      uploaded: false,
    });
    await txPutMeta(db, {
      coopKey,
      contratoId: contratoId || prev?.contratoId || "",
      count: index + 1,
      savedAt: Date.now(),
      pendingNotaId: prev?.pendingNotaId,
      numeroNota: prev?.numeroNota,
      createdAt: prev?.createdAt,
      mesReferencia: prev?.mesReferencia,
    });
    return index;
  } finally {
    db.close();
  }
}

export async function markFotoDraftUploaded(coopKey: string, index: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    const row = await txGetFoto(db, coopKey, index);
    if (!row) return;
    await txPutFoto(db, { ...row, uploaded: true });
    const meta = await txGetMeta(db, coopKey);
    if (meta) await txPutMeta(db, { ...meta, savedAt: Date.now() });
  } finally {
    db.close();
  }
}

/** @deprecated Use appendFotoDraftMeta — fotos vão direto para a nuvem. */
export async function appendFotoDraft(
  coopKey: string,
  contratoId: string,
  _preview: string,
  data: string
): Promise<number> {
  const fp = fingerprintFoto(data);
  return appendFotoDraftMeta(coopKey, contratoId, fp);
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
        fingerprint: src.fingerprint,
        uploaded: src.uploaded,
      });
    }
    const fullMeta = await txGetMeta(freshDb, coopKey);
    await txPutMeta(freshDb, {
      coopKey,
      contratoId: meta.contratoId,
      count: rows.length,
      savedAt: Date.now(),
      pendingNotaId: fullMeta?.pendingNotaId,
      numeroNota: fullMeta?.numeroNota,
      createdAt: fullMeta?.createdAt,
      mesReferencia: fullMeta?.mesReferencia,
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

export async function saveFotoDraft(
  coopKey: string,
  _fotos: string[],
  _contratoId: string
): Promise<boolean> {
  if (_fotos.length === 0) {
    await clearFotoDraft(coopKey);
    return true;
  }
  return false;
}
