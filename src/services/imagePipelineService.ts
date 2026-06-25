import type { NotaPedido, NotaPedidoFoto } from "@/types";
import { uploadFotoBlobToCloud } from "@/services/notaPedidoCloudService";
import { normalizeCnpj } from "@/utils/cooperativa";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const WARN_IMAGE_BYTES = 8 * 1024 * 1024;
export const COMPRESS_MAX_WIDTH = 1024;
export const THUMBNAIL_MAX_WIDTH = 240;
export const COMPRESS_QUALITY = 0.68;
export const THUMBNAIL_QUALITY = 0.5;

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

interface CompressSettings {
  maxWidth: number;
  quality: number;
  thumbWidth: number;
  thumbQuality: number;
  preferWebP: boolean;
}

let webpSupportedCache: boolean | null = null;

function devLog(label: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[image-pipeline] ${label}`, data);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Processamento cancelado.", "AbortError");
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function estimateMemoryCost(file: File): number {
  const pixelGuess = Math.min(file.size * 4, 48 * 1024 * 1024);
  return file.size + pixelGuess;
}

export function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof dm === "number" && dm > 0 && dm <= 2;
}

export function resolveCompressSettings(_file?: File): CompressSettings {
  const low = isLowMemoryDevice();
  return {
    maxWidth: low ? 880 : COMPRESS_MAX_WIDTH,
    quality: low ? 0.6 : COMPRESS_QUALITY,
    thumbWidth: THUMBNAIL_MAX_WIDTH,
    thumbQuality: THUMBNAIL_QUALITY,
    preferWebP: !low,
  };
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

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string,
  quality: number
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(
            new Error(
              "A foto está muito pesada para este celular. Tente tirar uma nova foto mais próxima ou use uma imagem menor."
            )
          );
        }
      },
      mimeType,
      quality
    );
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function clearCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  if ("width" in canvas && "height" in canvas && !(canvas instanceof OffscreenCanvas)) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Uma decodificação → foto comprimida + miniatura (memória constante). */
async function processImageSinglePass(
  file: File,
  settings: CompressSettings,
  mimeType: "image/webp" | "image/jpeg",
  signal?: AbortSignal
): Promise<{ compressed: Blob; thumbnail: Blob; width: number; height: number }> {
  throwIfAborted(signal);
  await yieldToBrowser();

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: settings.maxWidth,
        resizeQuality: "medium",
      });
      throwIfAborted(signal);

      const width = bitmap.width;
      const height = bitmap.height;
      const mainCanvas = createCanvas(width, height);
      const mainCtx = mainCanvas.getContext("2d");
      if (!mainCtx) {
        bitmap.close();
        throw new Error("Canvas indisponível.");
      }
      mainCtx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const compressed = await canvasToBlob(mainCanvas, mimeType, settings.quality);
      clearCanvas(mainCanvas);
      throwIfAborted(signal);

      const thumbBitmap = await createImageBitmap(compressed, {
        resizeWidth: settings.thumbWidth,
        resizeQuality: "low",
      });
      const thumbCanvas = createCanvas(thumbBitmap.width, thumbBitmap.height);
      const thumbCtx = thumbCanvas.getContext("2d");
      if (!thumbCtx) {
        thumbBitmap.close();
        throw new Error("Canvas indisponível.");
      }
      thumbCtx.drawImage(thumbBitmap, 0, 0);
      thumbBitmap.close();

      const thumbnail = await canvasToBlob(thumbCanvas, mimeType, settings.thumbQuality);
      clearCanvas(thumbCanvas);
      return { compressed, thumbnail, width, height };
    } catch {
      /* fallback abaixo */
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const { width, height, draw, cleanup } = await new Promise<{
      width: number;
      height: number;
      draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void;
      cleanup: () => void;
    }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        throwIfAborted(signal);
        const scale = Math.min(1, settings.maxWidth / Math.max(img.width, 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        resolve({
          width,
          height,
          draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
          cleanup: () => {
            img.src = "";
          },
        });
      };
      img.onerror = () => {
        img.src = "";
        reject(new Error("Não foi possível ler a imagem."));
      };
      img.src = objectUrl;
    });

    const mainCanvas = createCanvas(width, height);
    const mainCtx = mainCanvas.getContext("2d");
    if (!mainCtx) throw new Error("Canvas indisponível.");
    draw(mainCtx, width, height);
    cleanup();

    const compressed = await canvasToBlob(mainCanvas, mimeType, settings.quality);
    clearCanvas(mainCanvas);
    throwIfAborted(signal);

    const thumbScale = Math.min(1, settings.thumbWidth / Math.max(width, 1));
    const tw = Math.max(1, Math.round(width * thumbScale));
    const th = Math.max(1, Math.round(height * thumbScale));
    const thumbCanvas = createCanvas(tw, th);
    const thumbCtx = thumbCanvas.getContext("2d");
    if (!thumbCtx) throw new Error("Canvas indisponível.");

    const tmpUrl = URL.createObjectURL(compressed);
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        thumbCtx.drawImage(img, 0, 0, tw, th);
        img.src = "";
        URL.revokeObjectURL(tmpUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(tmpUrl);
        reject(new Error("Memória insuficiente para miniatura."));
      };
      img.src = tmpUrl;
    });

    const thumbnail = await canvasToBlob(thumbCanvas, mimeType, settings.thumbQuality);
    clearCanvas(thumbCanvas);
    return { compressed, thumbnail, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<{ blob: Blob; mimeType: string; width: number; height: number; ms: number }> {
  const settings = resolveCompressSettings(file);
  const maxWidth = options.maxWidth ?? settings.maxWidth;
  const quality = options.quality ?? settings.quality;
  const preferWebP = options.preferWebP ?? settings.preferWebP;
  const started = performance.now();

  const useWebP = preferWebP && (await detectWebPSupport());
  const mimeType: "image/webp" | "image/jpeg" = useWebP ? "image/webp" : "image/jpeg";
  const { compressed, width, height } = await processImageSinglePass(
    file,
    { ...settings, maxWidth, quality },
    mimeType,
    options.signal
  );
  const ms = Math.round(performance.now() - started);
  devLog("compress", {
    originalBytes: file.size,
    compressedBytes: compressed.size,
    reductionPct: Math.round((1 - compressed.size / file.size) * 100),
    ms,
    mimeType,
    width,
    height,
  });
  return { blob: compressed, mimeType, width, height, ms };
}

export async function createThumbnail(
  file: File,
  options: { signal?: AbortSignal } = {}
): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const full = await processDeliveryImage(file, options.signal);
  return {
    blob: full.thumbnail,
    mimeType: full.mimeType,
    width: Math.min(full.width, THUMBNAIL_MAX_WIDTH),
    height: full.height,
  };
}

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

  const settings = resolveCompressSettings(file);
  const useWebP = settings.preferWebP && (await detectWebPSupport());
  const mimeType: "image/webp" | "image/jpeg" = useWebP ? "image/webp" : "image/jpeg";
  const started = performance.now();

  throwIfAborted(signal);
  const { compressed, thumbnail, width, height } = await processImageSinglePass(
    file,
    settings,
    mimeType,
    signal
  );

  const compressionMs = Math.round(performance.now() - started);
  devLog("processDeliveryImage", {
    originalBytes: file.size,
    compressedBytes: compressed.size,
    thumbBytes: thumbnail.size,
    compressionMs,
  });

  const previewUrl = URL.createObjectURL(compressed);
  return {
    compressed,
    thumbnail,
    previewUrl,
    mimeType,
    sizeBytes: compressed.size,
    width,
    height,
    originalSizeBytes: file.size,
    compressionMs,
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

/** Payload mínimo no FormData — evita JSON grande a cada foto. */
export function slimNotaDraftForUpload(nota: NotaPedido): NotaPedido {
  return {
    id: nota.id,
    cooperativaId: nota.cooperativaId,
    cooperadoId: nota.cooperadoId,
    instituicaoId: nota.instituicaoId,
    numeroNota: nota.numeroNota,
    dataEntrega: nota.dataEntrega,
    localEntrega: nota.localEntrega,
    itens: nota.itens ?? [],
    valorBruto: nota.valorBruto ?? 0,
    percentualDescontoCooperativa: nota.percentualDescontoCooperativa ?? 0,
    valorDesconto: nota.valorDesconto ?? 0,
    valorLiquido: nota.valorLiquido ?? 0,
    status: nota.status,
    fotosEnviadasCount: nota.fotosEnviadasCount,
    fotoNaNuvem: true,
    cooperativaCnpj: nota.cooperativaCnpj,
    cooperadoNomeSnapshot: nota.cooperadoNomeSnapshot,
    mesReferencia: nota.mesReferencia,
    observacoes: nota.observacoes,
    escolaAvulsaNome: nota.escolaAvulsaNome,
    createdAt: nota.createdAt,
    updatedAt: nota.updatedAt,
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
    slimNotaDraftForUpload(params.nota),
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
  return migrateLegacyBase64Images({
    ...nota,
    fotosMeta: next,
    fotoNaNuvem: foto.status === "uploaded" ? true : nota.fotoNaNuvem,
  });
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
