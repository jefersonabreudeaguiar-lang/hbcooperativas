import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";

const BUCKET = "hb-cooperativa-sync";

function storagePath(cnpj: string, comunicadoId: string): string {
  const digits = normalizeCnpj(cnpj);
  const safeId = comunicadoId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${digits}/comunicados/${safeId}.webm`;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024 });
}

export async function uploadComunicadoAudio(
  supabase: SupabaseClient,
  cnpj: string,
  comunicadoId: string,
  audioDataUrl: string
): Promise<{ ok: true; audioStoragePath: string } | { ok: false; error: string }> {
  const parsed = parseDataUrl(audioDataUrl);
  if (!parsed) return { ok: false, error: "Áudio inválido." };
  if (parsed.buffer.length > 500_000) {
    return { ok: false, error: "Áudio muito grande (máx. ~450 KB)." };
  }

  await ensureBucket(supabase);
  const path = storagePath(cnpj, comunicadoId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, parsed.buffer, {
    contentType: parsed.contentType || "audio/webm",
    upsert: true,
  });
  if (error) {
    console.error("[comunicado-audio/upload]", error.message);
    return { ok: false, error: "Não foi possível enviar o áudio." };
  }
  return { ok: true, audioStoragePath: path };
}

export async function createComunicadoAudioSignedUrl(
  supabase: SupabaseClient,
  audioStoragePath: string,
  expiresInSeconds = 3600
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await ensureBucket(supabase);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(audioStoragePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Áudio indisponível." };
  }
  return { ok: true, url: data.signedUrl };
}
