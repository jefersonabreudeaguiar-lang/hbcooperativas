import type { NotaPedido } from "@/types";
import {
  buildNotaPedidoFotoMeta,
  uploadImageToSupabase,
  type UploadImageParams,
} from "@/services/imagePipelineService";

const DB_NAME = "hb_cooperativas_media";
const DB_VERSION = 1;
const STORE = "pending_delivery_images";

export type PendingImageStatus = "local_pending" | "uploading" | "failed";

export interface PendingDeliveryImage {
  id: string;
  notaPedidoId: string;
  cooperativaId: string;
  cooperadoId: string;
  cnpj: string;
  index: number;
  totalCount: number;
  compressedBlob: Blob;
  thumbnailBlob: Blob;
  mimeType: string;
  cooperadoNome?: string;
  notaSnapshot: NotaPedido;
  createdAt: string;
  retryCount: number;
  status: PendingImageStatus;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byNota", "notaPedidoId", { unique: false });
        store.createIndex("byStatus", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Erro ao abrir fila offline."));
  });
}

function txGetAll(db: IDBDatabase): Promise<PendingDeliveryImage[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingDeliveryImage[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("Erro ao ler fila offline."));
  });
}

export async function enqueuePendingDeliveryImage(
  entry: Omit<PendingDeliveryImage, "createdAt" | "retryCount" | "status"> & {
    status?: PendingImageStatus;
  }
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao enfileirar foto."));
      tx.objectStore(STORE).put({
        ...entry,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: entry.status ?? "local_pending",
      } satisfies PendingDeliveryImage);
    });
  } finally {
    db.close();
  }
}

export async function listPendingDeliveryImages(
  notaPedidoId?: string
): Promise<PendingDeliveryImage[]> {
  const db = await openDb();
  try {
    const all = await txGetAll(db);
    return notaPedidoId ? all.filter((p) => p.notaPedidoId === notaPedidoId) : all;
  } finally {
    db.close();
  }
}

export async function removePendingDeliveryImage(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao remover da fila."));
      tx.objectStore(STORE).delete(id);
    });
  } finally {
    db.close();
  }
}

export async function markPendingDeliveryFailed(id: string, error: string): Promise<void> {
  const db = await openDb();
  try {
    const row = await new Promise<PendingDeliveryImage | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as PendingDeliveryImage | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!row) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        ...row,
        status: "failed",
        retryCount: row.retryCount + 1,
        lastError: error,
      });
    });
  } finally {
    db.close();
  }
}

export async function flushPendingDeliveryImages(): Promise<{
  uploaded: number;
  failed: number;
  remaining: number;
}> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const pending = await listPendingDeliveryImages();
    return { uploaded: 0, failed: 0, remaining: pending.length };
  }

  const pending = await listPendingDeliveryImages();
  let uploaded = 0;
  let failed = 0;

  for (const item of pending.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )) {
    if (item.retryCount >= 5) {
      failed += 1;
      continue;
    }

    const params: UploadImageParams = {
      cnpj: item.cnpj,
      nota: item.notaSnapshot,
      index: item.index,
      totalCount: item.totalCount,
      blob: item.compressedBlob,
      mimeType: item.mimeType,
      cooperadoNome: item.cooperadoNome,
    };

    const result = await uploadImageToSupabase(params);
    if (result.ok) {
      await removePendingDeliveryImage(item.id);
      uploaded += 1;
    } else if (result.offline) {
      break;
    } else {
      await markPendingDeliveryFailed(item.id, result.error ?? "Falha no upload.");
      failed += 1;
    }
  }

  const remaining = (await listPendingDeliveryImages()).length;
  return { uploaded, failed, remaining };
}

export function buildPendingImageId(notaId: string, index: number): string {
  return `${notaId}#${index}`;
}

export function pendingEntryToFotoMeta(entry: PendingDeliveryImage) {
  return buildNotaPedidoFotoMeta({
    cnpj: entry.cnpj,
    nota: entry.notaSnapshot,
    index: entry.index,
    totalCount: entry.totalCount,
    blob: entry.compressedBlob,
    mimeType: entry.mimeType,
    status: "local_pending",
  });
}
