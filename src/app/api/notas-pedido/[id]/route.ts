import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";
import { fetchNotaFromStorage, uploadNotaToStorage, deleteNotaFromStorage, deleteNotaFromTable } from "@/lib/supabase/notasStorage";

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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ nota: null, configured: false });
  }

  const { data, error } = await supabase
    .from("notas_pedido")
    .select("payload")
    .eq("id", id)
    .eq("cooperativa_cnpj", cnpj)
    .maybeSingle();

  if (!error && data?.payload) {
    const nota = data.payload as NotaPedido;
    if (nota?.id) return NextResponse.json({ nota });
  }

  if (error && !isNotasPedidoTableMissing(error)) {
    console.error("[notas-pedido/get]", error.message);
  }

  const nota = await fetchNotaFromStorage(supabase, cnpj, id);
  return NextResponse.json({ nota });
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const { error } = await supabase
    .from("notas_pedido")
    .update({
      status: nota.status,
      mes_referencia: nota.mesReferencia,
      payload: nota,
      updated_at: nota.updatedAt,
    })
    .eq("id", id)
    .eq("cooperativa_cnpj", cnpj);

  if (!error) {
    return NextResponse.json({ success: true, source: "table" });
  }

  if (!isNotasPedidoTableMissing(error)) {
    console.error("[notas-pedido/patch]", error.message);
  }

  const uploaded = await uploadNotaToStorage(supabase, cnpj, nota);
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const tableDel = await deleteNotaFromTable(supabase, cnpj, id);
  if (tableDel.ok) {
    await deleteNotaFromStorage(supabase, cnpj, id);
    return NextResponse.json({ success: true });
  }

  const storageDel = await deleteNotaFromStorage(supabase, cnpj, id);
  if (!storageDel.ok) {
    return NextResponse.json({ error: storageDel.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, source: "storage" });
}
