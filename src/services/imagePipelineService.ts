import type { NotaPedido, NotaPedidoFoto } from "@/types";
import { uploadFotoBlobToCloud } from "@/services/notaPedidoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const WARN_IMAGE_BYTES = 8 * 1024 * 1024;
export const COMPRESS_MAX_WIDTH = 1280;
export const THUMBNAIL_MAX_WIDTH = 320;
export const COMPRESS_QUALITY = 0.7;
export const THUMBNAIL_QUALITY = 0.55;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImagePipelineStep = "preparing" | "compressing" | "uploading" | "success" | "error";

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
  warning?: string;
  lowMemoryDevice?: boolean;
}

export interface CompressImageOptions {
  maxWidth?: number;
  quality?: number;
  preferWebP?: boolean;
  signal?: AbortSignal;
}

export interface ProcessedDeliveryImage {
  compressed: Blob;
  thumbnail: Blob;
  previewUrl: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  originalSizeBytes: number;
  compressionMs: number;
}

export interface UploadImageParams {
  cnpj: string;
  nota: NotaPedido;
  index: number;
  totalCount: number;
  blob: Blob;
  mimeType: string;
  cooperadoNome?: string;
}

export interface UploadImageResult {
  ok: boolean;
  offline?: boolean;
  error?: string;
  storagePath?: string;
}

let webpSupportedCache: boolean | null = null;

function devLog(label: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[image-pipeline] ${label}`, data);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Processamento cancelado.", "AbortError");
}

export function estimateMemoryCost(file: File): number {
  /** Estimativa conservadora: decode bitmap ≈ 4 bytes/pixel + original file. */
  const pixelGuess = Math.min(file.size * 4, 48 * 1024 * 1024);
  return file.size + pixelGuess;
}

export function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === "number" && dm > 0 && dm <= 2;
}

export function validateImageFile(file: File): ImageValidationResult {
  if (!file || file.size === 0) {
    return { ok: false, error: "Arquivo vazio ou inválido." };
  }

  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      error: "Formato não suportado. Use JPEG, PNG ou WebP.",
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error:
        "Arquivo acima de 20 MB. Tire uma foto nova mais próxima ou escolha uma imagem menor.",
    };
  }

  const lowMemoryDevice = isLowMemoryDevice();
  const warning =
    file.size >= WARN_IMAGE_BYTES
      ? "Foto grande — será comprimida automaticamente para envio."
      : lowMemoryDevice
        ? "Aparelho com pouca memória — feche outros apps se a foto demorar."
        : undefined;

  if (lowMemoryDevice && file.size > 12 * 1024 * 1024) {
    return {
      ok: false,
      error:
        "A foto está muito pesada para este celular. Tente tirar uma nova foto mais próxima ou use uma imagem menor.",
      lowMemoryDevice,
    };
  }

  return { ok: true, warning, lowMemoryDevice };
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

async function detectWebPSupport(): Promise<boolean> {
  if (webpSupportedCache !== null) return webpSupportedCache;
  if (typeof document === "undefined") {
    webpSupportedCache = false;
    return false;
  }
  webpSupportedCache = await new Promise<boolean>((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.toBlob((blob) => resolve(blob?.type === "image/webp"), "image/webp", 0.7);
  });
  return webpSupportedCache;
}

async function loadImageSource(file: File, signal?: AbortSignal): Promise<{ src: string; revoke: () => void }> {
  throwIfAborted(signal);
  const objectUrl = URL.createObjectURL(file);
  return {
    src: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

async function renderToBlob(
  src: string,
  maxWidth: number,
  quality: number,
  mimeType: "image/webp" | "image/jpeg",
  signal?: AbortSignal
): Promise<{ blob: Blob; width: number; height: number }> {
  throwIfAborted(signal);
  if (typeof document === "undefined") {
    throw new Error("Canvas indisponível neste ambiente.");
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      throwIfAborted(signal);
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        img.src = "";
        reject(new Error("Canvas indisponível."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      img.src = "";
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            reject(
              new Error(
                "A foto está muito pesada para este celular. Tente tirar uma nova foto mais próxima ou use uma imagem menor."
              )
            );
            return;
          }
          resolve({ blob, width, height });
        },
        mimeType,
        quality
      );
    };
    img.onerror = () => {
      img.src = "";
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = src;
  });
}

export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<{ blob: Blob; mimeType: string; width: number; height: number; ms: number }> {
  const maxWidth = options.maxWidth ?? COMPRESS_MAX_WIDTH;
  const quality = options.quality ?? COMPRESS_QUALITY;
  const preferWebP = options.preferWebP ?? true;
  const started = performance.now();

  const { src, revoke } = await loadImageSource(file, options.signal);
  try {
    const useWebP = preferWebP && (await detectWebPSupport());
    const mimeType: "image/webp" | "image/jpeg" = useWebP ? "image/webp" : "image/jpeg";
    const { blob, width, height } = await renderToBlob(src, maxWidth, quality, mimeType, options.signal);
    const ms = Math.round(performance.now() - started);
    devLog("compress", {
      originalBytes: file.size,
      compressedBytes: blob.size,
      reductionPct: Math.round((1 - blob.size / file.size) * 100),
      ms,
      mimeType,
      width,
      height,
    });
    return { blob, mimeType, width, height, ms };
  } finally {
    revoke();
  }
}

export async function createThumbnail(
  file: File,
  options: { signal?: AbortSignal } = {}
): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const { src, revoke } = await loadImageSource(file, options.signal);
  try {
    const useWebP = await detectWebPSupport();
    const mimeType: "image/webp" | "image/jpeg" = useWebP ? "image/webp" : "image/jpeg";
    const { blob, width, height } = await renderToBlob(
      src,
      THUMBNAIL_MAX_WIDTH,
      THUMBNAIL_QUALITY,
      mimeType,
      options.signal
    );
    return { blob, mimeType, width, height };
  } finally {
    revoke();
  }
}

/** Comprime a partir do blob já gerado (evita reler arquivo original). */
export async function createThumbnailFromBlob(
  source: Blob,
  signal?: AbortSignal
): Promise<Blob> {
  const file = new File([source], "thumb-src.jpg", { type: source.type || "image/jpeg" });
  const thumb = await createThumbnail(file, { signal });
  return thumb.blob;
}

export async function processDeliveryImage(
  file: File,
  signal?: AbortSignal
): Promise<ProcessedDeliveryImage> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    throw new Error(validation.error ?? "Arquivo inválido.");
  }

  throwIfAborted(signal);
  const compressed = await compressImage(file, { signal });
  throwIfAborted(signal);
  const thumbnail = await createThumbnailFromBlob(compressed.blob, signal);
  throwIfAborted(signal);

  const previewUrl = URL.createObjectURL(compressed.blob);
  return {
    compressed: compressed.blob,
    thumbnail,
    previewUrl,
    mimeType: compressed.mimeType,
    sizeBytes: compressed.blob.size,
    width: compressed.width,
    height: compressed.height,
    originalSizeBytes: file.size,
    compressionMs: compressed.ms,
  };
}

export function buildStoragePath(cnpj: string, notaId: string, index: number): string {
  const digits = normalizeCnpj(cnpj);
  return `${digits}/${notaId}/foto-${String(index).padStart(3, "0")}.jpg`;
}

export function buildNotaPedidoFotoMeta(
  params: UploadImageParams & { status?: NotaPedidoFoto["status"] }
): NotaPedidoFoto {
  const storagePath = buildStoragePath(params.cnpj, params.nota.id, params.index);
  return {
    id: `${params.nota.id}-f${params.index}`,
    storagePath,
    mimeType: params.mimeType,
    sizeBytes: params.blob.size,
    width: 0,
    height: 0,
    status: params.status ?? "uploaded",
    createdAt: new Date().toISOString(),
    index: params.index,
  };
}

export async function uploadImageToSupabase(params: UploadImageParams): Promise<UploadImageResult> {
  const digits = normalizeCnpj(params.cnpj);
  if (digits.length !== 14) return { ok: false, error: "CNPJ inválido." };

  const ext = params.mimeType.includes("webp") ? "webp" : "jpg";
  const uploadBlob =
    params.blob.type === params.mimeType
      ? params.blob
      : new Blob([params.blob], { type: params.mimeType });

  const result = await uploadFotoBlobToCloud(
    digits,
    params.nota,
    params.index,
    params.totalCount,
    uploadBlob,
    params.cooperadoNome,
    ext
  );

  if (!result.ok) {
    return {
      ok: false,
      offline: result.offline,
      error: result.error,
    };
  }

  return {
    ok: true,
    storagePath: buildStoragePath(digits, params.nota.id, params.index),
  };
}

/** Mantém leitura de fotos antigas em base64; prepara metadados leves quando possível. */
export function migrateLegacyBase64Images(nota: NotaPedido): NotaPedido {
  if (nota.fotosMeta?.length) return nota;
  if (nota.fotoNaNuvem && !nota.fotoPedido && !nota.fotosPedido?.length) return nota;

  const legacyUrls = [
    ...(nota.fotosPedido ?? []),
    ...(nota.fotoPedido ? [nota.fotoPedido] : []),
  ].filter(Boolean);

  if (legacyUrls.length === 0) return nota;

  const fotosMeta: NotaPedidoFoto[] = legacyUrls.map((url, index) => ({
    id: `${nota.id}-legacy-${index}`,
    url,
    mimeType: url.startsWith("data:image/png") ? "image/png" : "image/jpeg",
    sizeBytes: Math.round(url.length * 0.75),
    width: 0,
    height: 0,
    status: nota.fotoNaNuvem ? "uploaded" : "local_pending",
    createdAt: nota.updatedAt ?? nota.createdAt,
    index,
  }));

  return { ...nota, fotosMeta };
}

export function appendFotoMetaToNota(nota: NotaPedido, foto: NotaPedidoFoto): NotaPedido {
  const prev = nota.fotosMeta ?? [];
  const next = [...prev.filter((f) => f.index !== foto.index), foto].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  return migrateLegacyBase64Images({ ...nota, fotosMeta: next, fotoNaNuvem: foto.status === "uploaded" ? true : nota.fotoNaNuvem });
}

export function userFacingPipelineError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Envio cancelado.";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/mem[oó]ria|memory|canvas|pesada|grande/i.test(msg)) {
    return "A foto está muito pesada para este celular. Tente tirar uma nova foto mais próxima ou use uma imagem menor.";
  }
  return msg || "Não foi possível processar a foto. Tente outra imagem ou feche outros apps.";
}
