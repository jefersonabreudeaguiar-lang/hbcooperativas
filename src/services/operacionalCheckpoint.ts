import type { OperacionalSyncPayload } from "@/lib/supabase/cooperativaSyncStorage";

export type OperacionalCheckpoint = {
  revision: string | null;
  local: OperacionalSyncPayload;
  cloud: OperacionalSyncPayload;
};

const STORE = "checkpoints";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let testStorage: {
  load: (scope: string) => Promise<OperacionalCheckpoint | null>;
  save: (scope: string, base: OperacionalCheckpoint) => Promise<void>;
} | undefined;

export function setOperacionalCheckpointStorageForTests(storage: typeof testStorage): void {
  testStorage = storage;
}

type StoredCheckpoint = { id: string; scope: string; savedAt: number; base: OperacionalCheckpoint };

function openCheckpointDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("hb_operacional_sync", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("savedAt", "savedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadOperacionalCheckpoint(scope: string, id: string): Promise<OperacionalCheckpoint | null> {
  if (testStorage) return testStorage.load(scope);
  const db = await openCheckpointDb();
  try {
    const row = await new Promise<StoredCheckpoint | undefined>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!row || row.scope !== scope || Date.now() - row.savedAt > MAX_AGE_MS) {
      throw new Error("A referência da edição local expirou. Preserve o lançamento antes de atualizar.");
    }
    return row.base;
  } finally {
    db.close();
  }
}

export async function persistOperacionalCheckpoint(scope: string, base: OperacionalCheckpoint): Promise<string> {
  const id = crypto.randomUUID();
  if (testStorage) {
    await testStorage.save(scope, base);
    return id;
  }
  const db = await openCheckpointDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      store.add({ id, scope, savedAt: Date.now(), base } satisfies StoredCheckpoint);
      const expired = store.index("savedAt").openCursor(IDBKeyRange.upperBound(Date.now() - MAX_AGE_MS));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
    });
    return id;
  } finally {
    db.close();
  }
}
