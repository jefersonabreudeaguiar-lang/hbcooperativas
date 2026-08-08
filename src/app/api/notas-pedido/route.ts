import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
  notaPayloadForTable,
  uploadNotaToStorage,
  upsertNotasInTable,
  enrichNotasListWithPreviews,
} from "@/lib/supabase/notasStorage";

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

  const lite = searchParams.get("lite") === "1";
  const withPreviews = searchParams.get("previews") === "1";
  const since = searchParams.get("since")?.trim() || undefined;
  const delta = Boolean(since);

  const fromTable = await fetchNotasFromTable(supabase, cnpj, since);

  const visiveis = (lista: NotaPedido[]) =>
    lista.filter((n) => n.status !== "rascunho");

  // Sem tabela SQL: delta vazio escondia entregas publicadas (só storage).
  // Sempre lista o storage completo — nunca retornar [] por causa de `since`.
  if (fromTable.tableMissing) {
    const fromStorage = await fetchNotasFromStorage(supabase, cnpj);
    const merged = visiveis(fromStorage);
    const notas =
      lite && !withPreviews
        ? merged
        : await enrichNotasListWithPreviews(supabase, cnpj, merged);
    return NextResponse.json({
      notas,
      source: "storage",
      storageOnly: true,
      // Força o cliente a tratar como full (não avançar cursor de delta cego).
      serverWatermark: undefined,
    });
  }

  const fromStorage = delta
    ? ([] as NotaPedido[])
    : await fetchNotasFromStorage(supabase, cnpj);

  const merged = visiveis(
    delta ? fromTable.notas : mergeNotasSources(fromTable.notas, fromStorage)
  );
  const notas =
    lite && !withPreviews
      ? merged
      : await enrichNotasListWithPreviews(supabase, cnpj, merged);
  return NextResponse.json({
    notas,
    source: delta ? "delta" : "merged",
    serverWatermark: fromTable.serverWatermark,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Nuvem não configurada.", configured: false },
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

  const tableResult = await upsertNotasInTable(
    supabase,
    cnpj,
    notas.map(notaPayloadForTable),
    cooperadoNome
  );
  if (tableResult.ok) {
    for (const nota of notas) {
      const uploaded = await uploadNotaToStorage(supabase, cnpj, nota, cooperadoNome);
      if (!uploaded.ok) {
        return NextResponse.json({ error: uploaded.error }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true, count: notas.length, source: "table" }, { status: 201 });
  }

  for (const nota of notas) {
    const uploaded = await uploadNotaToStorage(supabase, cnpj, nota, cooperadoNome);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }
  }

  return NextResponse.json(
    { success: true, count: notas.length, source: "storage" },
    { status: 201 }
  );
}
