import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaPedido } from "@/types";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { protectNotaAgainstStatusDowngrade } from "@/utils/notaStatus";
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

/** Remove uma foto da nuvem e compacta índices seguintes (foto-002 vira foto-001, etc.). */
export async function deleteAndCompactFotoPart(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string,
  removeIndex: number,
  totalCount: number
): Promise<{ ok: true; newCount: number } | { ok: false; error: string }> {
  if (removeIndex < 0 || removeIndex >= totalCount) {
    return { ok: false, error: "Índice de foto inválido." };
  }

  await ensureEntregasBucket(supabase);

  const { error: delErr } = await supabase.storage
    .from(BUCKET)
    .remove([fotoPartPath(cnpj, notaId, removeIndex)]);
  if (delErr) {
    console.error("[notas-storage/delete-part]", delErr.message);
    return { ok: false, error: "Erro ao remover foto na nuvem." };
  }

  for (let i = removeIndex + 1; i < totalCount; i++) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(fotoPartPath(cnpj, notaId, i));
    if (dlErr || !blob) continue;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const newIndex = i - 1;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(fotoPartPath(cnpj, notaId, newIndex), buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (upErr) {
      console.error("[notas-storage/compact-part]", upErr.message);
      return { ok: false, error: "Erro ao reorganizar fotos na nuvem." };
    }
    await supabase.storage.from(BUCKET).remove([fotoPartPath(cnpj, notaId, i)]);
  }

  const newCount = totalCount - 1;
  const meta = await fetchNotaMetaFromStorage(supabase, cnpj, notaId);
  if (meta) {
    const updated: NotaPedido = {
      ...meta,
      fotosEnviadasCount: newCount,
      fotoNaNuvem: newCount > 0,
      updatedAt: new Date().toISOString(),
    };
    await supabase.storage
      .from(BUCKET)
      .upload(storagePath(cnpj, notaId), JSON.stringify(updated), {
        contentType: "application/json",
        upsert: true,
      });
    const { error: tableErr } = await supabase
      .from("notas_pedido")
      .update({
        payload: notaPayloadForTable(updated),
        updated_at: updated.updatedAt,
      })
      .eq("id", notaId)
      .eq("cooperativa_cnpj", cnpj);
    if (tableErr && !isNotasPedidoTableMissing(tableErr)) {
      console.error("[notas-storage/delete-part-table]", tableErr.message);
    }
  }

  return { ok: true, newCount };
}

/** Conta arquivos foto-*.jpg já enviados (sem carregar conteúdo). */
export async function countUploadedFotoParts(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string
): Promise<number> {
  const folder = `${cnpj}/${notaId}`;
  const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 500 });
  if (!files?.length) return 0;
  return files.filter((f) => f.name.startsWith("foto-") && f.name.endsWith(".jpg")).length;
}

/** Metadados JSON da entrega — sem montar fotos (leve). */
export async function fetchNotaMetaFromStorage(
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

/** Anexa só a 1ª foto para cards da fila (responsável) — não carrega todas. */
async function attachListPreviewFromParts(
  supabase: SupabaseClient,
  cnpj: string,
  nota: NotaPedido
): Promise<NotaPedido> {
  if (!notaUsesFotoParts(nota)) return nota;
  if (nota.fotoPedidoMiniatura || nota.fotosPedidoMiniaturas?.length) return nota;
  const first = await downloadFotoPartAsDataUrl(supabase, cnpj, nota.id, 0);
  if (!first) return nota;
  return {
    ...nota,
    fotoPedidoMiniatura: first,
    fotosPedidoMiniaturas: [first],
  };
}

/** Anexa miniatura da 1ª foto para exibição na fila (sync list). */
export async function enrichNotasListWithPreviews(
  supabase: SupabaseClient,
  cnpj: string,
  notas: NotaPedido[]
): Promise<NotaPedido[]> {
  const out: NotaPedido[] = [];
  for (const nota of notas) {
    out.push(await attachListPreviewFromParts(supabase, cnpj, nota));
  }
  return out;
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
  const jpeg = dataUrlToBuffer(fotoDataUrl);
  return uploadNotaFotoPartBuffer(supabase, cnpj, nota, index, totalCount, jpeg, cooperadoNome);
}

/** Upload direto de bytes JPEG — usado com FormData (sem base64 no celular). */
export async function uploadNotaFotoPartBuffer(
  supabase: SupabaseClient,
  cnpj: string,
  nota: NotaPedido,
  index: number,
  totalCount: number,
  jpeg: Buffer,
  cooperadoNome?: string,
  contentType = "image/jpeg"
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

  const { error: fotoErr } = await supabase.storage
    .from(BUCKET)
    .upload(fotoPartPath(cnpj, nota.id, index), jpeg, {
      contentType,
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
  const files: { name: string }[] = [];
  let offset = 0;
  const pageSize = 500;
  for (;;) {
    const { data: page, error } = await supabase.storage
      .from(BUCKET)
      .list(cnpj, { limit: pageSize, offset });
    if (error || !page?.length) break;
    files.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  if (!files.length) return [];

  const notas: NotaPedido[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(`${cnpj}/${file.name}`);
    if (dlErr || !blob) continue;
    try {
      const parsed = JSON.parse(await blob.text()) as NotaPedido;
      if (!parsed?.id) continue;
      notas.push(parsed);
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
  notaId: string,
  options?: { includePhotos?: boolean }
): Promise<NotaPedido | null> {
  await ensureEntregasBucket(supabase);
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath(cnpj, notaId));
  if (error || !blob) return null;
  try {
    const parsed = JSON.parse(await blob.text()) as NotaPedido;
    if (!parsed?.id) return null;
    if (options?.includePhotos && notaUsesFotoParts(parsed)) {
      return assembleNotaFotosFromParts(supabase, cnpj, parsed);
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Baixa uma foto da nuvem (stream) — sem base64 na RAM. */
export async function downloadFotoPartBuffer(
  supabase: SupabaseClient,
  cnpj: string,
  notaId: string,
  index: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(fotoPartPath(cnpj, notaId, index));
  if (error || !blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || "image/jpeg";
  return { buffer, contentType };
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
  cnpj: string,
  since?: string
): Promise<{ notas: NotaPedido[]; tableMissing: boolean; serverWatermark?: string }> {
  let query = supabase
    .from("notas_pedido")
    .select("payload, status, updated_at")
    .eq("cooperativa_cnpj", cnpj);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return { notas: [], tableMissing: true };
    }
    console.error("[notas-pedido/list]", error.message);
    return { notas: [], tableMissing: false };
  }

  let serverWatermark: string | undefined;
  const notas = (data ?? [])
    .map((row) => {
      const payload = row.payload as NotaPedido | null;
      if (!payload?.id) return null;
      const sqlStatus = row.status as NotaPedido["status"] | null;
      const sqlUpdatedAt = typeof row.updated_at === "string" ? row.updated_at : undefined;
      if (sqlUpdatedAt) {
        const t = new Date(sqlUpdatedAt).getTime();
        const prev = serverWatermark ? new Date(serverWatermark).getTime() : 0;
        if (Number.isFinite(t) && t >= prev) serverWatermark = sqlUpdatedAt;
      }
      // Coluna SQL status ganha se payload ainda estiver em rascunho (desync).
      const status =
        sqlStatus && sqlStatus !== "rascunho"
          ? sqlStatus
          : payload.status;
      return {
        ...payload,
        status,
        updatedAt: sqlUpdatedAt ?? payload.updatedAt,
        serverUpdatedAt: sqlUpdatedAt,
      } as NotaPedido & { serverUpdatedAt?: string };
    })
    .filter((n): n is NotaPedido & { serverUpdatedAt?: string } => Boolean(n));

  return { notas, tableMissing: false, serverWatermark };
}

export async function upsertNotasInTable(
  supabase: SupabaseClient,
  cnpj: string,
  notas: NotaPedido[],
  cooperadoNome?: string
): Promise<{ ok: true } | { ok: false; tableMissing: boolean; error?: string }> {
  if (notas.length === 0) return { ok: true };

  const ids = notas.map((n) => n.id);
  const { data: existingRows, error: existingError } = await supabase
    .from("notas_pedido")
    .select("id, status, payload")
    .eq("cooperativa_cnpj", cnpj)
    .in("id", ids);

  if (existingError && !isNotasPedidoTableMissing(existingError)) {
    console.error("[notas-pedido/upsert-existing]", existingError.message);
  }
  if (existingError && isNotasPedidoTableMissing(existingError)) {
    return { ok: false, tableMissing: true };
  }

  const existingById = new Map(
    (existingRows ?? []).map((row) => [
      String(row.id),
      {
        status: row.status as NotaPedido["status"] | undefined,
        payload: (row.payload as NotaPedido | null) ?? undefined,
      },
    ])
  );

  const protectedNotas = notas.map((nota) => {
    const ex = existingById.get(nota.id);
    if (!ex?.status) return nota;
    return protectNotaAgainstStatusDowngrade(
      { ...(ex.payload ?? {}), status: ex.status },
      nota
    );
  });

  const rows = protectedNotas.map((nota) => ({
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
    const pathsToRemove: string[] = [];
    for (const file of files) {
      if (file.name.endsWith(".json")) {
        pathsToRemove.push(`${digits}/${file.name}`);
        const notaId = file.name.replace(/\.json$/, "");
        await removeNotaFotoParts(supabase, digits, notaId);
      }
    }
    if (pathsToRemove.length) {
      const { error } = await supabase.storage.from(BUCKET).remove(pathsToRemove);
      if (!error) removed += pathsToRemove.length;
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
