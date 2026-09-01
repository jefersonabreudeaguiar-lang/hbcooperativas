import jsQR from "jsqr";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

let nativeDetector: BarcodeDetectorLike | null | undefined;

function getNativeQrDetector(): BarcodeDetectorLike | null {
  if (nativeDetector !== undefined) return nativeDetector;
  if (typeof window === "undefined" || !window.BarcodeDetector) {
    nativeDetector = null;
    return null;
  }
  try {
    nativeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

export function normalizeQrPayload(raw: string): string {
  return raw.replace(/\uFEFF/g, "").trim();
}

function decodeJsQrImageData(imageData: ImageData): string | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  const payload = result?.data ? normalizeQrPayload(result.data) : "";
  return payload || null;
}

function cropCenterImageData(source: ImageData, ratio = 0.72): ImageData | null {
  const sw = source.width;
  const sh = source.height;
  const cw = Math.max(1, Math.floor(sw * ratio));
  const ch = Math.max(1, Math.floor(sh * ratio));
  const sx = Math.floor((sw - cw) / 2);
  const sy = Math.floor((sh - ch) / 2);
  const cropped = new ImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const srcIdx = ((sy + y) * sw + (sx + x)) * 4;
      const dstIdx = (y * cw + x) * 4;
      cropped.data[dstIdx] = source.data[srcIdx];
      cropped.data[dstIdx + 1] = source.data[srcIdx + 1];
      cropped.data[dstIdx + 2] = source.data[srcIdx + 2];
      cropped.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }
  return cropped;
}

function scaleImageData(source: ImageData, scale: number): ImageData {
  const w = Math.max(1, Math.floor(source.width * scale));
  const h = Math.max(1, Math.floor(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tmp = document.createElement("canvas");
  tmp.width = source.width;
  tmp.height = source.height;
  tmp.getContext("2d")!.putImageData(source, 0, 0);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(tmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export function decodeQrFromImageData(imageData: ImageData): string | null {
  const attempts: ImageData[] = [imageData];
  const center = cropCenterImageData(imageData);
  if (center) attempts.push(center);
  if (imageData.width > 900) {
    attempts.push(scaleImageData(imageData, 0.5));
  } else if (imageData.width < 480) {
    attempts.push(scaleImageData(imageData, 2));
  }

  for (const attempt of attempts) {
    const payload = decodeJsQrImageData(attempt);
    if (payload) return payload;
  }
  return null;
}

async function decodeWithNative(source: ImageBitmapSource): Promise<string | null> {
  const detector = getNativeQrDetector();
  if (!detector) return null;
  try {
    const codes = await detector.detect(source);
    for (const code of codes) {
      const payload = code.rawValue ? normalizeQrPayload(code.rawValue) : "";
      if (payload) return payload;
    }
  } catch {
    /* fallback jsQR */
  }
  return null;
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const nativeFromFile = await decodeWithNative(file);
  if (nativeFromFile) return nativeFromFile;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const fromBitmap = await decodeWithNative(bitmap);
    if (fromBitmap) return fromBitmap;
    return decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } finally {
    bitmap.close();
  }
}

export async function decodeQrFromVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return null;
  }

  const native = await decodeWithNative(video);
  if (native) return native;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}
