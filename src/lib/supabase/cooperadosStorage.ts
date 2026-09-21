import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cooperado } from "@/types";
import { mergeAssinaturaCadastroFields, mergeDuplicatasAssinaturaNaLista } from "@/services/cooperadoAssinaturaService";

const BUCKET = "hb-cooperados";

/** JSON do cooperado + assinatura em base64 — 512 KB era insuficiente para PNG grande. */
export const COOPERADOS_BUCKET_FILE_SIZE_LIMIT = 2 * 1024 * 1024;

export async function ensureCooperadosBucket(supabase: SupabaseClient): Promise<void> {
  const limit = COOPERADOS_BUCKET_FILE_SIZE_LIMIT;
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === BUCKET);
  if (!existing) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: limit });
    return;
  }
  const currentLimit = existing.file_size_limit ?? existing.fileSizeLimit ?? 0;
  if (currentLimit < limit) {
    await supabase.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: limit });
  }
}

function storagePath(cnpj: string, cooperadoId: string): string {
  return `${cnpj}/${cooperadoId}.json`;
}

export async function uploadCooperadoToStorage(
  supabase: SupabaseClient,
  cnpj: string,
  cooperado: Cooperado,
  email?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureCooperadosBucket(supabase);
  const existing = await fetchCooperadoFromStorage(supabase, cnpj, cooperado.id);
  let cooperadoToSave = cooperado;
  if (existing) {
    const assinatura = mergeAssinaturaCadastroFields(existing, cooperado);
    const updatedAt =
      new Date(existing.updatedAt).getTime() >= new Date(cooperado.updatedAt).getTime()
        ? existing.updatedAt
        : cooperado.updatedAt;
    cooperadoToSave = { ...cooperado, ...assinatura, updatedAt };
  }
  const payload = JSON.stringify({
    cooperado: { ...cooperadoToSave, cooperativaCnpj: cnpj },
    email: email?.trim().toLowerCase() || undefined,
    cooperativaCnpj: cnpj,
  });
  if (payload.length > COOPERADOS_BUCKET_FILE_SIZE_LIMIT) {
    console.error("[cooperados-storage/upload] payload too large", payload.length);
    return {
      ok: false,
      error:
        "Cadastro excede o limite na nuvem. Peça ao cooperado reenviar a assinatura (foto mais próxima ou menos zoom).",
    };
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(cnpj, cooperado.id), payload, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    console.error("[cooperados-storage/upload]", error.message);
    return { ok: false, error: "Erro ao sincronizar cooperado na nuvem." };
  }
  return { ok: true };
}

export async function fetchCooperadoFromStorage(
  supabase: SupabaseClient,
  cnpj: string,
  cooperadoId: string
): Promise<Cooperado | null> {
  if (!cooperadoId.trim()) return null;
  await ensureCooperadosBucket(supabase);
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath(cnpj, cooperadoId));
  if (error || !blob) return null;
  try {
    const parsed = JSON.parse(await blob.text()) as { cooperado?: Cooperado };
    return parsed?.cooperado?.id ? parsed.cooperado : null;
  } catch {
    return null;
  }
}

export async function fetchCooperadosFromStorage(
  supabase: SupabaseClient,
  cnpj: string
): Promise<Cooperado[]> {
  await ensureCooperadosBucket(supabase);
  const { data: files, error } = await supabase.storage.from(BUCKET).list(cnpj, { limit: 500 });
  if (error || !files?.length) return [];

  const cooperados: Cooperado[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(`${cnpj}/${file.name}`);
    if (dlErr || !blob) continue;
    try {
      const parsed = JSON.parse(await blob.text()) as { cooperado?: Cooperado };
      if (parsed?.cooperado?.id) cooperados.push(parsed.cooperado);
    } catch {
      /* ignore corrupt file */
    }
  }
  return mergeDuplicatasAssinaturaNaLista(cooperados).sort((a, b) =>
    a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")
  );
}

/** Lista bruta (inclui duplicados/desligados) — uso administrativo. */
export async function fetchAllCooperadosFromStorage(
  supabase: SupabaseClient,
  cnpj: string
): Promise<Cooperado[]> {
  await ensureCooperadosBucket(supabase);
  const { data: files, error } = await supabase.storage.from(BUCKET).list(cnpj, { limit: 1000 });
  if (error || !files?.length) return [];

  const cooperados: Cooperado[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(`${cnpj}/${file.name}`);
    if (dlErr || !blob) continue;
    try {
      const parsed = JSON.parse(await blob.text()) as { cooperado?: Cooperado };
      if (parsed?.cooperado?.id) cooperados.push(parsed.cooperado);
    } catch {
      /* ignore corrupt file */
    }
  }
  return cooperados;
}
