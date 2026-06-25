import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaPedido } from "@/types";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { mergeNotaComFotos } from "@/utils/fotoEntrega";

const BUCKET = "hb-entregas";
export const FOTOS_STORAGE_PARTS = "parts";

function storagePath(cnpj: string, notaId: string): string {
  return `${cnpj}/${notaId}.json`;
}

function fotoPartPath(cnpj: string, notaId: string, index: number): string {
  return `${cnpj}/${notaId}/foto-${String(index).padStart(3, "0")}.jpg`;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

function bufferToDataUrl(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function notaUsesFotoParts(nota: NotaPedido): boolean {
  if (nota.fotosPedido?.length) return false;
  return Boolean(nota.fotosEnviadasCount && nota.fotosEnviadasCount > 0);
}

async function downloadFotoPartAsDataUrl(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string,
  index: number
): Promise<string | undefined> {
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(fotoPartPath(cnpj, notaId, index));
  if (error || !blob) return undefined;
  const buffer = Buffer.from(await blob.arrayBuffer());
  return bufferToDataUrl(buffer);
}

/** Monta fotosPedido a partir de arquivos separados na nuvem. */
export async function assembleNotaFotosFromParts(
  supabase: SupabaseClient,
  cnpj: string,
  nota: NotaPedido
): Promise<NotaPedido> {
  if (nota.fotosPedido?.length) return nota;
  const count = nota.fotosEnviadasCount ?? 0;
  if (count <= 0) return nota;

  const fotos: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await downloadFotoPartAsDataUrl(supabase, cnpj, nota.id, i);
    if (part) fotos.push(part);
  }
  if (fotos.length === 0) return nota;
  return {
    ...nota,
    fotoPedido: fotos[0],
    fotosPedido: fotos,
    fotosEnviadasCount: Math.max(count, fotos.length),
    fotoNaNuvem: true,
  };
}

/** Envia uma foto por vez — não reescreve JSON gigante na nuvem. */
export async function uploadNotaFotoPart(
  supabase: SupabaseClient,
  cnpj: string,
  nota: NotaPedido,
  index: number,
  totalCount: number,
  fotoDataUrl: string,
  cooperadoNome?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureEntregasBucket(supabase);

  const metaPayload: NotaPedido = {
    ...nota,
    cooperadoNomeSnapshot: nota.cooperadoNomeSnapshot ?? cooperadoNome,
    cooperativaCnpj: cnpj,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
    fotosEnviadasCount: totalCount,
    fotoNaNuvem: true,
    updatedAt: new Date().toISOString(),
  };

  const jpeg = dataUrlToBuffer(fotoDataUrl);
  const { error: fotoErr } = await supabase.storage
    .from(BUCKET)
    .upload(fotoPartPath(cnpj, nota.id, index), jpeg, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (fotoErr) {
    console.error("[notas-storage/foto-part]", fotoErr.message);
    return { ok: false, error: "Erro ao enviar foto para a nuvem." };
  }

  const { error: metaErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath(cnpj, nota.id), JSON.stringify(metaPayload), {
      contentType: "application/json",
      upsert: true,
    });
  if (metaErr) {
    console.error("[notas-storage/meta]", metaErr.message);
    return { ok: false, error: "Erro ao atualizar entrega na nuvem." };
  }

  return { ok: true };
}

async function removeNotaFotoParts(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string
): Promise<void> {
  const folder = `${cnpj}/${notaId}`;
  const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 500 });
  if (!files?.length) return;
  const paths = files.map((f) => `${folder}/${f.name}`);
  await supabase.storage.from(BUCKET).remove(paths);
}

export async function ensureEntregasBucket(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
}

/** Metadados na tabela SQL — fotos completas ficam no storage JSON. */
export function notaPayloadForTable(nota: NotaPedido): NotaPedido {
  const qtd =
    nota.fotosEnviadasCount ??
    nota.fotosPedido?.length ??
    (nota.fotoPedido ? 1 : 0);
  return {
    ...nota,
    fotoPedido: undefined,
    fotosPedido: undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
    fotoNaNuvem: qtd > 0 ? true : nota.fotoNaNuvem,
    fotosEnviadasCount: qtd > 0 ? qtd : nota.fotosEnviadasCount,
  };
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
    if (!parsed?.id) return null;
    if (notaUsesFotoParts(parsed)) {
      return assembleNotaFotosFromParts(supabase, cnpj, parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Une notas da tabela SQL e do storage, mantendo metadados recentes e o maior conjunto de fotos. */
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
    byId.set(nota.id, mergeNotaComFotos(cur, nota));
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
  await removeNotaFotoParts(supabase, cnpj, notaId);
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
