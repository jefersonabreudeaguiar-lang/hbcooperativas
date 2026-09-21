import { compressAssinaturaDataUrlForStorage } from "@/utils/assinaturaPapelProcess";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

function canvasToPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

async function renderToCanvas(dataUrl: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx };
}

/** Gira a imagem em múltiplos de 90° (sentido horário positivo). */
export async function rotateAssinaturaDataUrl(dataUrl: string, degrees: number): Promise<string> {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return dataUrl;

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const swap = normalized === 90 || normalized === 270;
  canvas.width = swap ? img.height : img.width;
  canvas.height = swap ? img.width : img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvasToPng(canvas);
}

export type AssinaturaCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Recorte manual — coordenadas normalizadas (0–1) em relação à imagem atual. */
export async function cropAssinaturaDataUrl(dataUrl: string, rect: AssinaturaCropRect): Promise<string> {
  const img = await loadImage(dataUrl);
  const x = Math.max(0, Math.min(1, rect.x));
  const y = Math.max(0, Math.min(1, rect.y));
  const w = Math.max(0.02, Math.min(1 - x, rect.width));
  const h = Math.max(0.02, Math.min(1 - y, rect.height));

  const sx = Math.floor(x * img.width);
  const sy = Math.floor(y * img.height);
  const sw = Math.max(1, Math.floor(w * img.width));
  const sh = Math.max(1, Math.floor(h * img.height));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvasToPng(canvas);
}

/** Remove margens em branco ao redor do traço da assinatura. */
export async function trimAssinaturaInk(dataUrl: string): Promise<string> {
  const { canvas, ctx } = await renderToCanvas(dataUrl);
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let inkPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 210) {
        inkPixels += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkPixels < 20) {
    throw new Error("Não foi possível detectar o traço da assinatura para recortar.");
  }

  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;

  return cropAssinaturaDataUrl(dataUrl, {
    x: minX / width,
    y: minY / height,
    width: trimW / width,
    height: trimH / height,
  });
}

export async function finalizeAssinaturaEdit(dataUrl: string): Promise<{ dataUrl: string; hash: string }> {
  return compressAssinaturaDataUrlForStorage(dataUrl);
}
