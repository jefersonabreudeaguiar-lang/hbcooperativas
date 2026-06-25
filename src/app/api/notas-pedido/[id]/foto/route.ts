import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";
import {
  fetchNotaFromStorage,
  notaPayloadForTable,
  uploadNotaFotoPart,
  upsertNotasInTable,
} from "@/lib/supabase/notasStorage";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body?.foto || typeof body.index !== "number" || typeof body.totalCount !== "number") {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const index = body.index as number;
  const totalCount = body.totalCount as number;
  const foto = String(body.foto);
  const cooperadoNome = String(body.cooperadoNome ?? "").trim();
  const notaBody = body.nota as NotaPedido | undefined;

  if (cnpj.length !== 14 || index < 0 || totalCount < 1 || index >= totalCount) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  let metaNota: NotaPedido | null = null;

  if (index === 0) {
    if (!notaBody?.id || notaBody.id !== id) {
      return NextResponse.json({ error: "Entrega inicial inválida." }, { status: 400 });
    }
    metaNota = {
      ...notaBody,
      id,
      fotosEnviadasCount: totalCount,
      fotoNaNuvem: true,
      fotoPedido: undefined,
      fotosPedido: undefined,
      fotoPedidoMiniatura: undefined,
      fotosPedidoMiniaturas: undefined,
      updatedAt: new Date().toISOString(),
    };
    const tableResult = await upsertNotasInTable(
      supabase,
      cnpj,
      [notaPayloadForTable(metaNota)],
      cooperadoNome
    );
    if (!tableResult.ok && !tableResult.tableMissing) {
      return NextResponse.json({ error: tableResult.error ?? "Erro ao registrar entrega." }, { status: 500 });
    }
  } else {
    if (notaBody?.id === id) {
      metaNota = {
        ...notaBody,
        id,
        fotosEnviadasCount: totalCount,
        fotoNaNuvem: true,
        fotoPedido: undefined,
        fotosPedido: undefined,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const fromStorage = await fetchNotaFromStorage(supabase, cnpj, id);
      if (fromStorage) {
        metaNota = {
          ...fromStorage,
          fotosEnviadasCount: totalCount,
          fotoNaNuvem: true,
          fotoPedido: undefined,
          fotosPedido: undefined,
          updatedAt: new Date().toISOString(),
        };
      }
    }
    if (!metaNota) {
      return NextResponse.json({ error: "Entrega não encontrada na nuvem." }, { status: 404 });
    }
  }

  const uploaded = await uploadNotaFotoPart(
    supabase,
    cnpj,
    metaNota,
    index,
    totalCount,
    foto,
    cooperadoNome
  );
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  if (index > 0) {
    const { error } = await supabase
      .from("notas_pedido")
      .update({
        payload: notaPayloadForTable(metaNota),
        updated_at: metaNota.updatedAt,
      })
      .eq("id", id)
      .eq("cooperativa_cnpj", cnpj);

    if (error && !isNotasPedidoTableMissing(error)) {
      console.error("[notas-pedido/foto/patch-meta]", error.message);
    }
  }

  return NextResponse.json({ success: true, index, totalCount });
}
