import type { NotaPedido } from "@/types";
import {
  LOCAL_MEDIA_REF_PREFIX,
  buildLocalMediaRef,
  isLocalMediaRef,
  parseLocalMediaRef,
} from "@/utils/fotoEntrega";
import { blobToDataUrl } from "@/utils/fotoEntrega";
import { openMediaDb, STORE_LOCAL_NOTA_MEDIA } from "@/services/mediaDb";

export interface LocalNotaMediaRecord {
  id: string;
  notaPedidoId: string;
  index: number;
  blob: Blob;
  thumbnailBlob?: Blob;
  mimeType: string;
  createdAt: string;
}

const blobUrlCache = new Map<string, string>();

export function revokeLocalMediaBlobUrl(ref: string): void {
  const url = blobUrlCache.get(ref);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    blobUrlCache.delete(ref);
  }
}

export function clearLocalMediaBlobUrlCache(): void {
  for (const ref of blobUrlCache.keys()) revokeLocalMediaBlobUrl(ref);
}

export async function putLocalNotaMedia(
  notaPedidoId: string,
  index: number,
  blob: Blob,
  options?: { thumbnailBlob?: Blob; mimeType?: string }
): Promise<string> {
  const id = buildLocalMediaRef(notaPedidoId, index).slice(LOCAL_MEDIA_REF_PREFIX.length);
  const ref = buildLocalMediaRef(notaPedidoId, index);
  revokeLocalMediaBlobUrl(ref);

  const db = await openMediaDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_NOTA_MEDIA, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Erro ao gravar mídia local."));
      tx.objectStore(STORE_LOCAL_NOTA_MEDIA).put({
        id,
        notaPedidoId,
        index,
        blob,
        thumbnailBlob: options?.thumbnailBlob,
        mimeType: options?.mimeType ?? blob.type ?? "image/jpeg",
        createdAt: new Date().toISOString(),
      } satisfies LocalNotaMediaRecord);
    });
  } finally {
    db.close();
  }
  return ref;
}

async function getLocalNotaMediaRecord(ref: string): Promise<LocalNotaMediaRecord | null> {
  const parsed = parseLocalMediaRef(ref);
  if (!parsed) return null;
  const id = ref.slice(LOCAL_MEDIA_REF_PREFIX.length);

  const db = await openMediaDb();
  try {
    return await new Promise<LocalNotaMediaRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_NOTA_MEDIA, "readonly");
      const req = tx.objectStore(STORE_LOCAL_NOTA_MEDIA).get(id);
      req.onsuccess = () => resolve((req.result as LocalNotaMediaRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function getLocalMediaBlob(ref: string): Promise<Blob | null> {
  const row = await getLocalNotaMediaRecord(ref);
  return row?.blob ?? null;
}

export async function getLocalMediaBlobUrl(ref: string): Promise<string | null> {
  if (!isLocalMediaRef(ref)) return ref;
  const cached = blobUrlCache.get(ref);
  if (cached) return cached;

  const row = await getLocalNotaMediaRecord(ref);
  if (!row) return null;
  const source = row.thumbnailBlob ?? row.blob;
  const url = URL.createObjectURL(source);
  blobUrlCache.set(ref, url);
  return url;
}

export async function readNotaFotoAtIndex(
  nota: NotaPedido,
  index: number
): Promise<string | undefined> {
  const inline =
    nota.fotosPedido?.[index] ??
    (index === 0 ? nota.fotoPedido : undefined);
  if (!inline) return undefined;
  if (!isLocalMediaRef(inline)) return inline;

  const blob = await getLocalMediaBlob(inline);
  if (!blob) return undefined;
  return blobToDataUrl(blob);
}

export async function resolveNotaFotosForUpload(nota: NotaPedido): Promise<string[]> {
  const count = Math.max(
    nota.fotosEnviadasCount ?? 0,
    nota.fotosPedido?.length ?? 0,
    nota.fotoPedido ? 1 : 0
  );
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const foto = await readNotaFotoAtIndex(nota, i);
    if (foto) out.push(foto);
  }
  return out;
}

export async function removeLocalNotaMedia(notaPedidoId: string, index?: number): Promise<void> {
  const db = await openMediaDb();
  try {
    const rows = await new Promise<LocalNotaMediaRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_NOTA_MEDIA, "readonly");
      const req = tx.objectStore(STORE_LOCAL_NOTA_MEDIA).getAll();
      req.onsuccess = () => resolve((req.result as LocalNotaMediaRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    const targets =
      index === undefined
        ? rows.filter((r) => r.notaPedidoId === notaPedidoId)
        : rows.filter((r) => r.notaPedidoId === notaPedidoId && r.index === index);

    if (targets.length === 0) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_NOTA_MEDIA, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_LOCAL_NOTA_MEDIA);
      for (const row of targets) {
        revokeLocalMediaBlobUrl(buildLocalMediaRef(row.notaPedidoId, row.index));
        store.delete(row.id);
      }
    });
  } finally {
    db.close();
  }
}

export async function countLocalNotaMedia(notaPedidoId: string): Promise<number> {
  const db = await openMediaDb();
  try {
    const rows = await new Promise<LocalNotaMediaRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_NOTA_MEDIA, "readonly");
      const req = tx.objectStore(STORE_LOCAL_NOTA_MEDIA).getAll();
      req.onsuccess = () => resolve((req.result as LocalNotaMediaRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    return rows.filter((r) => r.notaPedidoId === notaPedidoId).length;
  } finally {
    db.close();
  }
}
