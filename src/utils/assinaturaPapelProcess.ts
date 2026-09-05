/** Fração da altura da foto acima da linha guia (área da assinatura no papel). */
export const ASSINATURA_GUIA_CORTE_RATIO = 0.68;

export async function hashAssinaturaDataUrl(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

/** Recorta região acima da linha guia, normaliza e gera PNG para uso nos documentos. */
export async function processarFotoAssinaturaPapel(
  file: File,
  corteRatio = ASSINATURA_GUIA_CORTE_RATIO
): Promise<{ dataUrl: string; hash: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const cropH = Math.max(40, Math.floor(img.height * corteRatio));
    const cropW = img.width;

    const work = document.createElement("canvas");
    work.width = cropW;
    work.height = cropH;
    const wctx = work.getContext("2d");
    if (!wctx) throw new Error("Canvas indisponível.");
    wctx.drawImage(img, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

    const { data } = wctx.getImageData(0, 0, cropW, cropH);
    let minX = cropW;
    let minY = cropH;
    let maxX = 0;
    let maxY = 0;
    let inkPixels = 0;

    for (let y = 0; y < cropH; y += 1) {
      for (let x = 0; x < cropW; x += 1) {
        const i = (y * cropW + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 210) {
          inkPixels += 1;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (inkPixels < 80) {
      throw new Error("Assinatura não detectada. Use caneta escura e assine acima da linha guia.");
    }

    const pad = 12;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(cropW - 1, maxX + pad);
    maxY = Math.min(cropH - 1, maxY + pad);
    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;

    const outW = 480;
    const outH = Math.max(48, Math.round((trimH / trimW) * outW));

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const octx = out.getContext("2d");
    if (!octx) throw new Error("Canvas indisponível.");

    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, outW, outH);
    octx.drawImage(work, minX, minY, trimW, trimH, 0, 0, outW, outH);

    const dataUrl = out.toDataURL("image/png");
    const hash = await hashAssinaturaDataUrl(dataUrl);
    return { dataUrl, hash };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
