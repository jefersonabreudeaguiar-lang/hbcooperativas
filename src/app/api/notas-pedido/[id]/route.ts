import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import {
  fetchNotaFromStorage,
  fetchNotaMetaFromStorage,
  countUploadedFotoParts,
  uploadNotaToStorage,
  deleteNotaFromStorage,
  deleteNotaFromTable,
  notaPayloadForTable,
  upsertNotasInTable,
} from "@/lib/supabase/notasStorage";
import { mergeNotaComFotos } from "@/utils/fotoEntrega";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ nota: null, configured: false });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ nota: null, configured: false });
  }

  if (searchParams.get("uploadProgress") === "1") {
    const uploadedParts = await countUploadedFotoParts(supabase, cnpj, id);
    const meta = await fetchNotaMetaFromStorage(supabase, cnpj, id);
    return NextResponse.json({ nota: meta, uploadedParts });
  }

  let fromTable: NotaPedido | null = null;
  const { data, error } = await supabase
    .from("notas_pedido")
    .select("payload, status, updated_at")
    .eq("id", id)
    .eq("cooperativa_cnpj", cnpj)
    .maybeSingle();

  if (!error && data?.payload) {
    const nota = data.payload as NotaPedido;
    const sqlStatus = data.status as NotaPedido["status"] | null;
    const sqlUpdatedAt = typeof data.updated_at === "string" ? data.updated_at : undefined;
    if (nota?.id) {
      fromTable = {
        ...nota,
        status:
          sqlStatus && sqlStatus !== "rascunho" ? sqlStatus : nota.status,
        updatedAt: sqlUpdatedAt ?? nota.updatedAt,
      };
    }
  } else if (error && !isNotasPedidoTableMissing(error)) {
    console.error("[notas-pedido/get]", error.message);
  }

  const fromStorage = await fetchNotaFromStorage(
    supabase,
    cnpj,
    id,
    { includePhotos: searchParams.get("full") === "1" }
  );
  if (fromTable && fromStorage) {
    return NextResponse.json({ nota: mergeNotaComFotos(fromTable, fromStorage) });
  }
  if (fromStorage) return NextResponse.json({ nota: fromStorage });
  if (fromTable) return NextResponse.json({ nota: fromTable });
  return NextResponse.json({ nota: null });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body?.nota) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const nota = body.nota as NotaPedido;
  if (cnpj.length !== 14 || nota.id !== id) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { write: true, checkSaas: true });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  // Upsert — update com 0 linhas no Supabase retorna sucesso e a entrega
  // ficava eternamente em rascunho (invisível na lista / some no sync).
  const tableResult = await upsertNotasInTable(
    supabase,
    cnpj,
    [notaPayloadForTable(nota)],
    nota.cooperadoNomeSnapshot
  );

  if (tableResult.ok) {
    const forStorage = notaPayloadForTable(nota);
    const uploaded = await uploadNotaToStorage(supabase, cnpj, forStorage);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, source: "table" });
  }

  if (!tableResult.tableMissing) {
    console.error("[notas-pedido/patch]", tableResult.error);
    return NextResponse.json({ error: tableResult.error ?? "Erro ao atualizar entrega." }, { status: 500 });
  }

  const uploaded = await uploadNotaToStorage(supabase, cnpj, notaPayloadForTable(nota));
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, source: "storage" });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, {
    requireManagement: true,
    write: true,
    checkSaas: true,
  });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const tableDel = await deleteNotaFromTable(supabase, cnpj, id);
  const storageDel = await deleteNotaFromStorage(supabase, cnpj, id);

  if (tableDel.ok || storageDel.ok) {
    return NextResponse.json({ success: true });
  }

  if (storageDel.ok === false && "error" in storageDel) {
    return NextResponse.json({ error: storageDel.error }, { status: 500 });
  }

  return NextResponse.json({ error: "Entrega não encontrada na nuvem." }, { status: 404 });
}
