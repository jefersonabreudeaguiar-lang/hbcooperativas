import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isNotasPedidoTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { NotaPedido } from "@/types";
import {
  deleteAndCompactFotoPart,
  fetchNotaMetaFromStorage,
  downloadFotoPartBuffer,
  notaPayloadForTable,
  uploadNotaFotoPart,
  uploadNotaFotoPartBuffer,
  upsertNotasInTable,
} from "@/lib/supabase/notasStorage";

interface FotoUploadInput {
  cnpj: string;
  index: number;
  totalCount: number;
  cooperadoNome: string;
  notaBody?: NotaPedido;
  isDraft: boolean;
  fotoDataUrl?: string;
  fotoBuffer?: Buffer;
  mimeType?: string;
}

async function parseFotoUploadRequest(request: Request): Promise<FotoUploadInput | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const cnpj = normalizeCnpj(String(form.get("cnpj") ?? ""));
    const index = Number(form.get("index"));
    const totalCount = Number(form.get("totalCount"));
    const cooperadoNome = String(form.get("cooperadoNome") ?? "").trim();
    const isDraft = form.get("draft") === "true";
    const notaRaw = form.get("nota");
    let notaBody: NotaPedido | undefined;
    if (typeof notaRaw === "string" && notaRaw.trim()) {
      try {
        notaBody = JSON.parse(notaRaw) as NotaPedido;
      } catch {
        return { error: "Metadados da entrega inválidos." };
      }
    }
    const file = form.get("foto");
    if (!(file instanceof Blob) || file.size === 0) {
      return { error: "Foto ausente ou inválida." };
    }
    const fotoBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = String(form.get("mimeType") ?? file.type ?? "image/jpeg");
    if (cnpj.length !== 14 || !Number.isFinite(index) || !Number.isFinite(totalCount)) {
      return { error: "Dados inválidos." };
    }
    return { cnpj, index, totalCount, cooperadoNome, notaBody, isDraft, fotoBuffer, mimeType };
  }

  const body = await request.json().catch(() => null);
  if (!body?.foto || typeof body.index !== "number" || typeof body.totalCount !== "number") {
    return { error: "Corpo inválido." };
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const index = body.index as number;
  const totalCount = body.totalCount as number;
  const cooperadoNome = String(body.cooperadoNome ?? "").trim();
  const notaBody = body.nota as NotaPedido | undefined;
  const isDraft = body.draft === true || notaBody?.status === "rascunho";

  if (cnpj.length !== 14) {
    return { error: "Dados inválidos." };
  }

  return {
    cnpj,
    index,
    totalCount,
    cooperadoNome,
    notaBody,
    isDraft,
    fotoDataUrl: String(body.foto),
  };
}

async function processFotoUpload(id: string, input: FotoUploadInput) {
  const { cnpj, index, totalCount, cooperadoNome, notaBody, isDraft, fotoDataUrl, fotoBuffer, mimeType } =
    input;

  if (index < 0 || totalCount < 1 || index >= totalCount) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  let metaNota: NotaPedido | null = null;

  // Status já publicado na nuvem nunca regride para rascunho (draft/offline tardio).
  const existingMeta =
    (await fetchNotaMetaFromStorage(supabase, cnpj, id)) ??
    (await (async () => {
      const { data } = await supabase
        .from("notas_pedido")
        .select("payload")
        .eq("id", id)
        .eq("cooperativa_cnpj", cnpj)
        .maybeSingle();
      const payload = data?.payload as NotaPedido | undefined;
      return payload?.id ? payload : null;
    })());
  const statusExistente = existingMeta?.status;
  const preservarPublicado =
    statusExistente && statusExistente !== "rascunho" ? statusExistente : undefined;

  if (index === 0) {
    if (!notaBody?.id || notaBody.id !== id) {
      return NextResponse.json({ error: "Entrega inicial inválida." }, { status: 400 });
    }
    metaNota = {
      ...notaBody,
      id,
      status:
        preservarPublicado ??
        (isDraft ? "rascunho" : (notaBody.status ?? "aguardando_conferencia")),
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
        status: preservarPublicado ?? notaBody.status,
        fotosEnviadasCount: totalCount,
        fotoNaNuvem: true,
        fotoPedido: undefined,
        fotosPedido: undefined,
        updatedAt: new Date().toISOString(),
      };
    } else if (existingMeta) {
      metaNota = {
        ...existingMeta,
        fotosEnviadasCount: totalCount,
        fotoNaNuvem: true,
        fotoPedido: undefined,
        fotosPedido: undefined,
        updatedAt: new Date().toISOString(),
      };
    }
    if (!metaNota) {
      return NextResponse.json({ error: "Entrega não encontrada na nuvem." }, { status: 404 });
    }
  }

  const uploaded = fotoBuffer
    ? await uploadNotaFotoPartBuffer(
        supabase,
        cnpj,
        metaNota,
        index,
        totalCount,
        fotoBuffer,
        cooperadoNome,
        mimeType ?? "image/jpeg"
      )
    : await uploadNotaFotoPart(
        supabase,
        cnpj,
        metaNota,
        index,
        totalCount,
        fotoDataUrl!,
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const index = Number(searchParams.get("index"));

  if (cnpj.length !== 14 || !Number.isFinite(index) || index < 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const part = await downloadFotoPartBuffer(supabase, cnpj, id, index);
  if (!part) {
    return NextResponse.json({ error: "Foto não encontrada." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(part.buffer), {
    headers: {
      "Content-Type": part.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const { id } = await context.params;
  const parsed = await parseFotoUploadRequest(request);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  return processFotoUpload(id, parsed);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const index = Number(searchParams.get("index"));
  const totalCount = Number(searchParams.get("totalCount"));

  if (cnpj.length !== 14 || !Number.isFinite(index) || !Number.isFinite(totalCount)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const result = await deleteAndCompactFotoPart(supabase, cnpj, id, index, totalCount);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, newCount: result.newCount });
}
