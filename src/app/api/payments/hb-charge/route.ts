import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  buildUnifiedHbChargeBreakdown,
  createUnifiedHbAsaasCharge,
} from "@/services/hbAsaasChargeService";
import { isAsaasConfigured } from "@/lib/asaas/config";

function currentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cnpjParam = normalizeCnpj(url.searchParams.get("cnpj") ?? "");
  const mes = url.searchParams.get("mes")?.trim() || currentMesReferencia();
  const autoPix = url.searchParams.get("autoPix") === "1";

  const gate = await guardCooperativaApi(request, cnpjParam, { requireManagement: true });
  if (!gate.ok) return gate.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const built = await buildUnifiedHbChargeBreakdown(supabase, cnpjParam, mes);
  if (!built.ok) return NextResponse.json(built, { status: 400 });

  if (!autoPix || built.breakdown.totalCents <= 0 || !isAsaasConfigured()) {
    return NextResponse.json({
      ok: true,
      breakdown: built.breakdown,
      autoPixAvailable: isAsaasConfigured() && built.breakdown.totalCents > 0,
    });
  }

  const { data: coopRow } = await supabase.from("cooperativas").select("email").eq("cnpj", cnpjParam).maybeSingle();

  const created = await createUnifiedHbAsaasCharge({
    supabase,
    cooperativeCnpj: cnpjParam,
    mesReferenciaContaCoop: mes,
    userId: gate.session?.sub,
    userName: gate.session?.name,
    coopEmail: coopRow?.email ? String(coopRow.email) : null,
  });

  if (!created.ok) {
    return NextResponse.json({
      ok: true,
      breakdown: built.breakdown,
      autoPixError: created.error,
    });
  }

  return NextResponse.json({
    ok: true,
    breakdown: created.breakdown,
    chargeId: created.charge.id,
    status: created.charge.status,
    pix: created.pix,
    invoiceUrl: created.charge.asaas_invoice_url,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const mesReferencia = String(body?.mesReferencia ?? currentMesReferencia());

  const gate = await guardCooperativaApi(request, cnpj, { requireManagement: true });
  if (!gate.ok) return gate.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const { data: coopRow } = await supabase.from("cooperativas").select("email").eq("cnpj", cnpj).maybeSingle();

  const created = await createUnifiedHbAsaasCharge({
    supabase,
    cooperativeCnpj: cnpj,
    mesReferenciaContaCoop: mesReferencia,
    userId: gate.session?.sub,
    userName: gate.session?.name,
    coopEmail: coopRow?.email ? String(coopRow.email) : null,
  });

  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    chargeId: created.charge.id,
    status: created.charge.status,
    breakdown: created.breakdown,
    pix: created.pix,
    invoiceUrl: created.charge.asaas_invoice_url,
  });
}
