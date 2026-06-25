/** Rascunho de fotos fora do localStorage — suporta dezenas de imagens no celular. */

const DB_NAME = "hb_anexar_fotos_v1";
const STORE = "drafts";
const MAX_AGE_MS = 30 * 60 * 1000;

interface FotoDraftRecord {
  coopKey: string;
  fotos: string[];
  contratoId: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "coopKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB indisponível."));
  });
}

function txPut(db: IDBDatabase, record: FotoDraftRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao gravar rascunho."));
    tx.objectStore(STORE).put(record);
  });
}

function txGet(db: IDBDatabase, coopKey: string): Promise<FotoDraftRecord | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao ler rascunho."));
    const req = tx.objectStore(STORE).get(coopKey);
    req.onsuccess = () => resolve(req.result as FotoDraftRecord | undefined);
    req.onerror = () => reject(req.error ?? new Error("Erro ao ler rascunho."));
  });
}

function txDelete(db: IDBDatabase, coopKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Erro ao apagar rascunho."));
    tx.objectStore(STORE).delete(coopKey);
  });
}

export async function saveFotoDraft(
  coopKey: string,
  fotos: string[],
  contratoId: string
): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  if (fotos.length === 0) {
    await clearFotoDraft(coopKey);
    return true;
  }
  try {
    const db = await openDb();
    await txPut(db, { coopKey, fotos, contratoId, savedAt: Date.now() });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadFotoDraft(
  coopKey: string
): Promise<{ fotos: string[]; contratoId: string } | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const row = await txGet(db, coopKey);
    db.close();
    if (!row?.fotos?.length) return null;
    if (Date.now() - row.savedAt > MAX_AGE_MS) {
      await clearFotoDraft(coopKey);
      return null;
    }
    return { fotos: row.fotos, contratoId: row.contratoId ?? "" };
  } catch {
    return null;
  }
}

export async function clearFotoDraft(coopKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await txDelete(db, coopKey);
    db.close();
  } catch {
    /* ignore */
  }
}
