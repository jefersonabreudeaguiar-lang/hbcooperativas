import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";
import { isAsaasConfigured } from "@/lib/asaas/config";
import { normalizeCnpj } from "@/utils/cooperativa";
import { createUnifiedHbAsaasCharge } from "@/services/hbAsaasChargeService";

function currentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isAsaasConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Integração Asaas não configurada. Defina ASAAS_API_KEY no servidor." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const mesReferencia = String(body?.mesReferencia ?? currentMesReferencia());

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

  const { data: coopRow } = await supabase.from("cooperativas").select("email").eq("cnpj", cnpj).maybeSingle();

  const created = await createUnifiedHbAsaasCharge({
    supabase,
    cooperativeCnpj: cnpj,
    mesReferenciaContaCoop: mesReferencia,
    userId: auth.session?.sub,
    userName: auth.session?.name ?? "Admin HB",
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
