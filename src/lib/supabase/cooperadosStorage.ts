import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cooperado } from "@/types";

const BUCKET = "hb-cooperados";

export async function ensureCooperadosBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 512 * 1024 });
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
  const payload = JSON.stringify({
    cooperado: { ...cooperado, cooperativaCnpj: cnpj },
    email: email?.trim().toLowerCase() || undefined,
    cooperativaCnpj: cnpj,
  });
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
  return cooperados.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
}
