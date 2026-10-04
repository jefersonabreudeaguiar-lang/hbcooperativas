import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { contarFotosEnviadasNota, notaTemFotoArmazenadaNaNuvem } from "@/utils/fotoEntrega";
import { revokePreviewUrl } from "@/services/imagePipelineService";
import { fetchNotaFotoPartBlobUrl, getCooperativaCnpj } from "@/services/notaPedidoCloudService";

const MAX_CACHE_ENTRIES = 96;

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(cnpj: string, notaId: string, index: number): string {
  return `${normalizeCnpj(cnpj)}:${notaId}:${index}`;
}

function trimCacheIfNeeded(): void {
  while (blobCache.size > MAX_CACHE_ENTRIES) {
    const first = blobCache.keys().next().value as string | undefined;
    if (!first) break;
    const url = blobCache.get(first);
    blobCache.delete(first);
    if (url) revokePreviewUrl(url);
  }
}

export function getConferenciaFotoBlobCached(
  cnpj: string,
  notaId: string,
  index: number
): string | undefined {
  return blobCache.get(cacheKey(cnpj, notaId, index));
}

export function rememberConferenciaFotoBlob(
  cnpj: string,
  notaId: string,
  index: number,
  url: string
): void {
  const k = cacheKey(cnpj, notaId, index);
  const prev = blobCache.get(k);
  if (prev && prev !== url) revokePreviewUrl(prev);
  blobCache.set(k, url);
  trimCacheIfNeeded();
}

export async function fetchConferenciaFotoPartCached(
  cnpj: string,
  notaId: string,
  index: number,
  partCount: number
): Promise<string | null> {
  const k = cacheKey(cnpj, notaId, index);
  const hit = blobCache.get(k);
  if (hit) return hit;

  let pending = inflight.get(k);
  if (!pending) {
    pending = fetchNotaFotoPartBlobUrl(cnpj, notaId, index, { partCount }).then((url) => {
      inflight.delete(k);
      if (url) rememberConferenciaFotoBlob(cnpj, notaId, index, url);
      return url;
    });
    inflight.set(k, pending);
  }
  return pending;
}

/** Baixa todas as partes em paralelo (pool) — conferência instantânea ao trocar foto. */
export async function warmConferenciaNotaFotos(
  cnpj: string,
  notaId: string,
  partCount: number,
  opts?: { maxParallel?: number }
): Promise<void> {
  if (partCount <= 0) return;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  const maxParallel = Math.min(opts?.maxParallel ?? 4, partCount);
  let cursor = 0;
  const indices = Array.from({ length: partCount }, (_, i) => i);

  async function worker(): Promise<void> {
    while (cursor < indices.length) {
      const index = indices[cursor++];
      if (blobCache.has(cacheKey(digits, notaId, index))) continue;
      await fetchConferenciaFotoPartCached(digits, notaId, index, partCount);
    }
  }

  await Promise.all(Array.from({ length: maxParallel }, () => worker()));
}

export function scheduleWarmConferenciaNotaFotos(
  data: AppData,
  coopId: string,
  nota: NotaPedido
): void {
  if (!notaTemFotoArmazenadaNaNuvem(nota)) return;
  const cnpj =
    getCooperativaCnpj(data, coopId) ??
    (normalizeCnpj(nota.cooperativaCnpj ?? "").length === 14 ? normalizeCnpj(nota.cooperativaCnpj!) : "");
  if (cnpj.length !== 14) return;
  const total = contarFotosEnviadasNota(nota);
  if (total <= 0) return;
  void warmConferenciaNotaFotos(cnpj, nota.id, total);
}
