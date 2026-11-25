type PhotoCanvas = HTMLCanvasElement | OffscreenCanvas;

function limitSize(width: number, height: number, limit: number) {
  const scale = Math.min(1, limit / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function encodePhotoCanvases(
  source: CanvasImageSource,
  dimensions: { width: number; height: number },
  settings: { maxWidth: number; quality: number; thumbWidth: number; thumbQuality: number },
  createCanvas: (width: number, height: number) => PhotoCanvas,
  encode: (canvas: PhotoCanvas, quality: number) => Promise<Blob>,
  releaseSource: () => void,
) {
  const { width, height } = limitSize(dimensions.width, dimensions.height, settings.maxWidth);
  const thumbSize = limitSize(width, height, settings.thumbWidth);
  let canvas: PhotoCanvas | undefined;
  let thumb: PhotoCanvas | undefined;
  try {
    try {
      canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível.");
      context.drawImage(source, 0, 0, width, height);
    } finally {
      releaseSource();
    }
    const compressed = await encode(canvas, settings.quality);
    try {
      thumb = createCanvas(thumbSize.width, thumbSize.height);
      const context = thumb.getContext("2d");
      if (!context) throw new Error("Canvas indisponível.");
      context.drawImage(canvas, 0, 0, thumbSize.width, thumbSize.height);
      const thumbnail = await encode(thumb, settings.thumbQuality);
      return { compressed, thumbnail, width, height };
    } catch {
      // A foto principal já está pronta. Uma falha na miniatura não perde o anexo.
      return { compressed, thumbnail: compressed, width, height };
    }
  } finally {
    if (thumb) { thumb.width = 0; thumb.height = 0; }
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
