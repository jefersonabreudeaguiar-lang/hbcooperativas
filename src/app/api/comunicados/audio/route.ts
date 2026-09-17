import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import {
  createComunicadoAudioSignedUrl,
  uploadComunicadoAudio,
} from "@/lib/supabase/comunicadoAudioStorage";
import { fetchOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  const comunicadoId = String(searchParams.get("comunicadoId") ?? "").trim();
  if (cnpj.length !== 14 || !comunicadoId) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente indisponível." }, { status: 503 });
  }

  const operacional = await fetchOperacionalSync(supabase, cnpj);
  let audioStoragePath = operacional?.comunicados?.find((c) => c.id === comunicadoId)?.audioStoragePath;
  const pathParam = searchParams.get("path")?.trim();
  if (!audioStoragePath && pathParam) audioStoragePath = pathParam;
  if (!audioStoragePath) {
    return NextResponse.json({ error: "Áudio não encontrado." }, { status: 404 });
  }

  const signed = await createComunicadoAudioSignedUrl(supabase, audioStoragePath);
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });
  return NextResponse.json({ url: signed.url });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const comunicadoId = String(body?.comunicadoId ?? "").trim();
  const audioDataUrl = String(body?.audioDataUrl ?? "");
  if (cnpj.length !== 14 || !comunicadoId || !audioDataUrl.startsWith("data:audio/")) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
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

  const uploaded = await uploadComunicadoAudio(supabase, cnpj, comunicadoId, audioDataUrl);
  if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 400 });
  return NextResponse.json({ audioStoragePath: uploaded.audioStoragePath }, { status: 201 });
}
