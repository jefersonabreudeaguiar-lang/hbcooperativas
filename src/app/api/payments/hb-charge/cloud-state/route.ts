import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { syncLocalFromCloudCharge } from "@/services/hbAsaasChargeService";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cnpj = normalizeCnpj(url.searchParams.get("cnpj") ?? "");
  const chargeId = url.searchParams.get("chargeId")?.trim() || undefined;

  const gate = await guardCooperativaApi(request, cnpj, { requireManagement: true });
  if (!gate.ok) return gate.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const state = await syncLocalFromCloudCharge(supabase, cnpj, chargeId);
  return NextResponse.json({ ok: true, ...state });
}
