import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "@/utils/cooperativa";
import { validateImageUpload } from "@/lib/security/uploadMime";

const BUCKET = "hb-conta-coop-settlement";
const MAX_BYTES = 12 * 1024 * 1024;

function settlementComprovantePath(cnpj: string, settlementId: string, ext: string): string {
  return `${normalizeCnpj(cnpj)}/settlements/${settlementId}.${ext}`;
}

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "jpg";
}

function detectPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function validateComprovanteUpload(
  buffer: Buffer,
  declaredMime?: string
): { ok: true; mime: string } | { ok: false; error: string } {
  if (buffer.length === 0) return { ok: false, error: "Arquivo vazio." };
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: "Arquivo excede o tamanho máximo permitido (12 MB)." };
  }

  if (detectPdf(buffer)) {
    return { ok: true, mime: "application/pdf" };
  }

  const imageCheck = validateImageUpload(buffer, declaredMime);
  if (imageCheck.ok) return imageCheck;

  return { ok: false, error: "Anexe uma imagem (JPEG, PNG, WebP) ou PDF do comprovante PIX." };
}

async function ensureSettlementBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
}

export async function uploadSettlementComprovante(
  supabase: SupabaseClient,
  params: {
    cnpj: string;
    settlementId: string;
    buffer: Buffer;
    mimeType?: string;
  }
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const mimeCheck = validateComprovanteUpload(params.buffer, params.mimeType);
  if (!mimeCheck.ok) return mimeCheck;

  await ensureSettlementBucket(supabase);
  const path = settlementComprovantePath(params.cnpj, params.settlementId, extFromMime(mimeCheck.mime));

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.buffer, {
    contentType: mimeCheck.mime,
    upsert: true,
  });
  if (uploadError) return { ok: false, error: "Erro ao enviar comprovante." };

  const { error: updateError } = await supabase
    .from("hb_credit_settlements")
    .update({
      comprovante_storage_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.settlementId);

  if (updateError) return { ok: false, error: "Erro ao registrar comprovante." };

  return { ok: true, path };
}

export async function getSettlementComprovanteSignedUrl(
  supabase: SupabaseClient,
  photoPath: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photoPath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
