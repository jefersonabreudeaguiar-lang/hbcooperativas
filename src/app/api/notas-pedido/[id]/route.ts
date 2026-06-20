import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";

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

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return NextResponse.json({ nota: null, migrationPending: true });
    }
    return NextResponse.json({ error: "Erro ao buscar entrega." }, { status: 500 });
  }

  const nota = data?.payload as NotaPedido | undefined;
  return NextResponse.json({ nota: nota?.id ? nota : null });
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

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return NextResponse.json({ migrationPending: true }, { status: 503 });
    }
    console.error("[notas-pedido/patch]", error.message);
    return NextResponse.json({ error: "Erro ao atualizar entrega." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
