import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { Cooperado } from "@/types";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import { fetchCooperadosFromStorage, uploadCooperadoToStorage } from "@/lib/supabase/cooperadosStorage";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ cooperados: [], configured: false });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj);
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ cooperados: [], configured: false });
  }

  const cooperados = await fetchCooperadosFromStorage(supabase, cnpj);
  return NextResponse.json({ cooperados, source: "storage" });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Nuvem não configurada.", configured: false },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.cooperado) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? body.cooperativaCnpj ?? ""));
  const cooperado = body.cooperado as Cooperado;
  const email = String(body.email ?? "").trim();

  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  if (!cooperado?.id || !cooperado?.nomeCompleto?.trim()) {
    return NextResponse.json({ error: "Cooperado inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { write: true, checkSaas: true });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const uploaded = await uploadCooperadoToStorage(supabase, cnpj, cooperado, email);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  if (guard.session) {
    await logServerMutationAudit(supabase, guard.session, cnpj, {
      action: "criar",
      entityType: "cooperado",
      entityId: cooperado.id,
      summary: `Cooperado ${cooperado.nomeCompleto} sincronizado na nuvem.`,
    });
  }

  return NextResponse.json({ success: true, source: "storage" }, { status: 201 });
}
