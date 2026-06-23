import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { Cooperado } from "@/types";
import { fetchCooperadosFromStorage, uploadCooperadoToStorage } from "@/lib/supabase/cooperadosStorage";
import { requireApiAuth, requireCooperativaAccess } from "@/lib/security/apiGuard";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ cooperados: [], configured: false });
  }

  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const denied = requireCooperativaAccess(auth.session, cnpj, auth.enforced);
  if (denied) return denied;

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

  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

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

  const denied = requireCooperativaAccess(auth.session, cnpj, auth.enforced);
  if (denied) return denied;
  if (!cooperado?.id || !cooperado?.nomeCompleto?.trim()) {
    return NextResponse.json({ error: "Cooperado inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const uploaded = await uploadCooperadoToStorage(supabase, cnpj, cooperado, email);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, source: "storage" }, { status: 201 });
}
