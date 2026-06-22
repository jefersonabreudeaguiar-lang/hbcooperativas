import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaPedido } from "@/types";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";

const BUCKET = "hb-entregas";

export async function ensureEntregasBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
}

function storagePath(cnpj: string, notaId: string): string {
  return `${cnpj}/${notaId}.json`;
}

export async function uploadNotaToStorage(
  supabase: SupabaseClient,
  cnpj: string,
  nota: NotaPedido,
  cooperadoNome?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureEntregasBucket(supabase);
  const payload = {
    ...nota,
    cooperadoNomeSnapshot: nota.cooperadoNomeSnapshot ?? cooperadoNome,
    cooperativaCnpj: cnpj,
  };
  const body = JSON.stringify(payload);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(cnpj, nota.id), body, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    console.error("[notas-storage/upload]", error.message);
    return { ok: false, error: "Erro ao enviar foto para a nuvem." };
  }
  return { ok: true };
}

export async function fetchNotasFromStorage(
  supabase: SupabaseClient,
  cnpj: string
): Promise<NotaPedido[]> {
  await ensureEntregasBucket(supabase);
  const { data: files, error } = await supabase.storage.from(BUCKET).list(cnpj, { limit: 500 });
  if (error || !files?.length) return [];

  const notas: NotaPedido[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(`${cnpj}/${file.name}`);
    if (dlErr || !blob) continue;
    try {
      const parsed = JSON.parse(await blob.text()) as NotaPedido;
      if (parsed?.id) notas.push(parsed);
    } catch {
      /* ignore corrupt file */
    }
  }
  return notas.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function fetchNotaFromStorage(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string
): Promise<NotaPedido | null> {
  await ensureEntregasBucket(supabase);
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath(cnpj, notaId));
  if (error || !blob) return null;
  try {
    const parsed = JSON.parse(await blob.text()) as NotaPedido;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

/** Tabela SQL (legado) — usada se existir. */
/** Une notas da tabela SQL e do storage, mantendo a versão mais recente por id. */
export function mergeNotasSources(tableNotas: NotaPedido[], storageNotas: NotaPedido[]): NotaPedido[] {
  const byId = new Map<string, NotaPedido>();
  for (const nota of tableNotas) {
    if (nota?.id) byId.set(nota.id, nota);
  }
  for (const nota of storageNotas) {
    if (!nota?.id) continue;
    const cur = byId.get(nota.id);
    if (!cur) {
      byId.set(nota.id, nota);
      continue;
    }
    const curTime = new Date(cur.updatedAt).getTime();
    const nextTime = new Date(nota.updatedAt).getTime();
    if (nextTime >= curTime) byId.set(nota.id, nota);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function fetchNotasFromTable(
  supabase: SupabaseClient,
  cnpj: string
): Promise<{ notas: NotaPedido[]; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from("notas_pedido")
    .select("payload, updated_at")
    .eq("cooperativa_cnpj", cnpj)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return { notas: [], tableMissing: true };
    }
    console.error("[notas-pedido/list]", error.message);
    return { notas: [], tableMissing: false };
  }

  const notas = (data ?? [])
    .map((row) => row.payload as NotaPedido)
    .filter((n) => n?.id);
  return { notas, tableMissing: false };
}

export async function upsertNotasInTable(
  supabase: SupabaseClient,
  cnpj: string,
  notas: NotaPedido[],
  cooperadoNome?: string
): Promise<{ ok: true } | { ok: false; tableMissing: boolean; error?: string }> {
  const rows = notas.map((nota) => ({
    id: nota.id,
    cooperativa_cnpj: cnpj,
    cooperado_id: nota.cooperadoId,
    cooperado_nome: cooperadoNome || nota.cooperadoNomeSnapshot || nota.cooperadoId,
    status: nota.status,
    mes_referencia: nota.mesReferencia,
    payload: nota,
    updated_at: nota.updatedAt,
    created_at: nota.createdAt,
  }));

  const { error } = await supabase.from("notas_pedido").upsert(rows, { onConflict: "id" });
  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return { ok: false, tableMissing: true };
    }
    return { ok: false, tableMissing: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteNotaFromStorage(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureEntregasBucket(supabase);
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath(cnpj, notaId)]);
  if (error) {
    console.error("[notas-storage/delete]", error.message);
    return { ok: false, error: "Erro ao excluir entrega na nuvem." };
  }
  return { ok: true };
}

export async function deleteNotaFromTable(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string
): Promise<{ ok: true } | { ok: false; tableMissing: boolean }> {
  const { error } = await supabase
    .from("notas_pedido")
    .delete()
    .eq("id", notaId)
    .eq("cooperativa_cnpj", cnpj);

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return { ok: false, tableMissing: true };
    }
    console.error("[notas-pedido/delete]", error.message);
    return { ok: false, tableMissing: false };
  }
  return { ok: true };
}

export async function deleteAllNotasForCnpj(
  supabase: SupabaseClient,
  cnpj: string
): Promise<{ removed: number; tableMissing: boolean }> {
  const digits = cnpj.replace(/\D/g, "");
  let removed = 0;

  await ensureEntregasBucket(supabase);
  const { data: files } = await supabase.storage.from(BUCKET).list(digits, { limit: 1000 });
  if (files?.length) {
    const paths = files
      .filter((file) => file.name.endsWith(".json"))
      .map((file) => `${digits}/${file.name}`);
    if (paths.length) {
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (!error) removed += paths.length;
    }
  }

  const { error, count } = await supabase
    .from("notas_pedido")
    .delete({ count: "exact" })
    .eq("cooperativa_cnpj", digits);

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return { removed, tableMissing: true };
    }
    console.error("[notas-pedido/delete-all]", error.message);
    return { removed, tableMissing: false };
  }

  return { removed: removed + (count ?? 0), tableMissing: false };
}
