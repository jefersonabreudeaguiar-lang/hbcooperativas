import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadContratosSync,
  uploadOperacionalSync,
  type ContratosSyncPayload,
  type OperacionalSyncPayload,
} from "@/lib/supabase/cooperativaSyncStorage";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, contratos: null, operacional: null });
  }

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, contratos: null, operacional: null });
  }

  const [contratos, operacional] = await Promise.all([
    fetchContratosSync(supabase, cnpj),
    fetchOperacionalSync(supabase, cnpj),
  ]);

  return NextResponse.json({ configured: true, contratos, operacional });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada.", configured: false }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.section || !body?.payload) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const section = String(body.section);
  if (section === "contratos") {
    const uploaded = await uploadContratosSync(supabase, cnpj, body.payload as ContratosSyncPayload);
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 500 });
    return NextResponse.json({ success: true, section }, { status: 201 });
  }

  if (section === "operacional") {
    const uploaded = await uploadOperacionalSync(supabase, cnpj, body.payload as OperacionalSyncPayload);
    if (!uploaded.ok) return NextResponse.json({ error: uploaded.error }, { status: 500 });
    return NextResponse.json({ success: true, section }, { status: 201 });
  }

  return NextResponse.json({ error: "Seção desconhecida." }, { status: 400 });
}
