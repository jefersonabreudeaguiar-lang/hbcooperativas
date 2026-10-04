import type { AppData, NotaPedido } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { contarFotosEnviadasNota, notaTemFotoArmazenadaNaNuvem } from "@/utils/fotoEntrega";
import { revokePreviewUrl } from "@/services/imagePipelineService";
import { fetchNotaFotoPartBlobUrl, getCooperativaCnpj } from "@/services/notaPedidoCloudService";

const MAX_CACHE_ENTRIES = 128;

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export type ConferenciaFotoFetchOpts = {
  preview?: boolean;
  partCount?: number;
};

function cacheKey(cnpj: string, notaId: string, index: number, preview: boolean): string {
  return `${normalizeCnpj(cnpj)}:${notaId}:${index}:${preview ? "p" : "f"}`;
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
  index: number,
  preview = true
): string | undefined {
  return blobCache.get(cacheKey(cnpj, notaId, index, preview));
}

export function rememberConferenciaFotoBlob(
  cnpj: string,
  notaId: string,
  index: number,
  url: string,
  preview = true
): void {
  const k = cacheKey(cnpj, notaId, index, preview);
  const prev = blobCache.get(k);
  if (prev && prev !== url) revokePreviewUrl(prev);
  blobCache.set(k, url);
  trimCacheIfNeeded();
}

export async function fetchConferenciaFotoPartCached(
  cnpj: string,
  notaId: string,
  index: number,
  partCount: number,
  opts?: ConferenciaFotoFetchOpts
): Promise<string | null> {
  const preview = opts?.preview !== false;
  const k = cacheKey(cnpj, notaId, index, preview);
  const hit = blobCache.get(k);
  if (hit) return hit;

  let pending = inflight.get(k);
  if (!pending) {
    pending = fetchNotaFotoPartBlobUrl(cnpj, notaId, index, {
      partCount: opts?.partCount ?? partCount,
      preview,
    }).then((url) => {
      inflight.delete(k);
      if (url) rememberConferenciaFotoBlob(cnpj, notaId, index, url, preview);
      return url;
    });
    inflight.set(k, pending);
  }
  return pending;
}

/** Vizinhas da foto atual — troca instantânea ao avançar no lançamento. */
export function prefetchAdjacentConferenciaFotos(
  cnpj: string,
  notaId: string,
  centerIndex: number,
  partCount: number
): void {
  if (partCount <= 1) return;
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;
  for (const i of [centerIndex - 1, centerIndex + 1, centerIndex + 2]) {
    if (i < 0 || i >= partCount) continue;
    void fetchConferenciaFotoPartCached(digits, notaId, i, partCount, { preview: true });
  }
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

  const maxParallel = Math.min(opts?.maxParallel ?? 3, partCount);
  let cursor = 0;
  const indices = Array.from({ length: partCount }, (_, i) => i);

  async function worker(): Promise<void> {
    while (cursor < indices.length) {
      const index = indices[cursor++];
      if (blobCache.has(cacheKey(digits, notaId, index, true))) continue;
      await fetchConferenciaFotoPartCached(digits, notaId, index, partCount, { preview: true });
    }
  }

  await Promise.all(Array.from({ length: maxParallel }, () => worker()));
}

let warmScheduleTimer: ReturnType<typeof setTimeout> | null = null;
let warmScheduleKey = "";

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
  const key = `${cnpj}:${nota.id}:${total}`;
  if (warmScheduleKey === key && warmScheduleTimer) return;
  warmScheduleKey = key;
  if (warmScheduleTimer) clearTimeout(warmScheduleTimer);
  warmScheduleTimer = setTimeout(() => {
    warmScheduleTimer = null;
    void warmConferenciaNotaFotos(cnpj, nota.id, total, { maxParallel: 2 });
  }, 400);
}
