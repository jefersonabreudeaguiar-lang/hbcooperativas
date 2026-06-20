import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";

function mapRow(row: Record<string, unknown>) {
  const payload = row.payload as NotaPedido;
  return payload;
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ notas: [], configured: false });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ notas: [], configured: false });
  }

  const { data, error } = await supabase
    .from("notas_pedido")
    .select("payload, updated_at")
    .eq("cooperativa_cnpj", cnpj)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return NextResponse.json({ notas: [], migrationPending: true });
    }
    console.error("[notas-pedido/list]", error.message);
    return NextResponse.json({ error: "Erro ao buscar entregas." }, { status: 500 });
  }

  return NextResponse.json({ notas: (data ?? []).map(mapRow) });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Nuvem não configurada. Entrega salva só neste aparelho.", configured: false },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const notas = (body.notas ?? []) as NotaPedido[];
  const cooperadoNome = String(body.cooperadoNome ?? "").trim();

  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  if (!Array.isArray(notas) || notas.length === 0) {
    return NextResponse.json({ error: "Nenhuma entrega informada." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const rows = notas.map((nota) => ({
    id: nota.id,
    cooperativa_cnpj: cnpj,
    cooperado_id: nota.cooperadoId,
    cooperado_nome: cooperadoNome || nota.cooperadoId,
    status: nota.status,
    mes_referencia: nota.mesReferencia,
    payload: nota,
    updated_at: nota.updatedAt,
    created_at: nota.createdAt,
  }));

  const { error } = await supabase.from("notas_pedido").upsert(rows, { onConflict: "id" });

  if (error) {
    if (isNotasPedidoTableMissing(error)) {
      return NextResponse.json(
        {
          error: "Crie a tabela notas_pedido no Supabase (SQL Editor).",
          migrationPending: true,
        },
        { status: 503 }
      );
    }
    console.error("[notas-pedido/push]", error.message);
    return NextResponse.json({ error: "Erro ao salvar entregas na nuvem." }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: rows.length }, { status: 201 });
}
