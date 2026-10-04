import sharp from "sharp";

/** Reduz JPEG para conferência no celular (menos bytes e decode mais rápido). */
export async function bufferFotoEntregaPreview(
  input: Buffer,
  maxEdge = 1280
): Promise<{ buffer: Buffer; contentType: string }> {
  const out = await sharp(input)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { buffer: out, contentType: "image/jpeg" };
}
