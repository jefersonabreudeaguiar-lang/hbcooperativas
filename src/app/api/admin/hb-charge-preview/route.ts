import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { buildUnifiedHbChargeBreakdown } from "@/services/hbAsaasChargeService";

function currentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  const url = new URL(request.url);
  const cnpj = normalizeCnpj(url.searchParams.get("cnpj") ?? "");
  const mes = url.searchParams.get("mes")?.trim() || currentMesReferencia();

  if (cnpj.length !== 14) {
    return NextResponse.json({ ok: false, error: "CNPJ inválido." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const built = await buildUnifiedHbChargeBreakdown(supabase, cnpj, mes);
  if (!built.ok) return NextResponse.json(built, { status: 400 });

  return NextResponse.json({ ok: true, breakdown: built.breakdown });
}
