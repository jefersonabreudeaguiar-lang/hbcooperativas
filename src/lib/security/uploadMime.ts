const MAX_FOTO_BYTES = 12 * 1024 * 1024;

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateImageUpload(
  buffer: Buffer,
  declaredMime?: string
): { ok: true; mime: string } | { ok: false; error: string } {
  if (buffer.length === 0) {
    return { ok: false, error: "Arquivo vazio." };
  }
  if (buffer.length > MAX_FOTO_BYTES) {
    return { ok: false, error: "Imagem excede o tamanho máximo permitido (12 MB)." };
  }

  const detected = detectImageMime(buffer);
  if (!detected) {
    return { ok: false, error: "Arquivo não é uma imagem JPEG, PNG ou WebP válida." };
  }

  if (declaredMime && declaredMime !== detected && !declaredMime.startsWith("image/")) {
    return { ok: false, error: "Tipo de arquivo não permitido." };
  }

  return { ok: true, mime: detected };
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function detectPdfMime(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

export function validatePdfUpload(
  buffer: Buffer,
  declaredMime?: string
): { ok: true; mime: string } | { ok: false; error: string } {
  if (buffer.length === 0) {
    return { ok: false, error: "Arquivo vazio." };
  }
  if (buffer.length > MAX_PDF_BYTES) {
    return { ok: false, error: "PDF excede o tamanho máximo permitido (15 MB)." };
  }
  if (!detectPdfMime(buffer)) {
    return { ok: false, error: "Envie um arquivo PDF válido (nota fiscal)." };
  }
  return { ok: true, mime: "application/pdf" };
}

export function bufferFromDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}
