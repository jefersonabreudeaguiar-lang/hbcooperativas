export const MEDIA_DB_NAME = "hb_cooperativas_media";
export const MEDIA_DB_VERSION = 2;

export const STORE_PENDING_DELIVERY = "pending_delivery_images";
export const STORE_LOCAL_NOTA_MEDIA = "local_nota_media";

export function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível."));
      return;
    }
    const req = indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDING_DELIVERY)) {
        const store = db.createObjectStore(STORE_PENDING_DELIVERY, { keyPath: "id" });
        store.createIndex("byNota", "notaPedidoId", { unique: false });
        store.createIndex("byStatus", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_NOTA_MEDIA)) {
        const store = db.createObjectStore(STORE_LOCAL_NOTA_MEDIA, { keyPath: "id" });
        store.createIndex("byNota", "notaPedidoId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Erro ao abrir IndexedDB de mídia."));
  });
}
