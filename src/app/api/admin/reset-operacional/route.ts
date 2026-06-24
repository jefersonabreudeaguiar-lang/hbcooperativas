import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  resetOperationalCloudAll,
  resetOperationalCloudForCnpj,
} from "@/lib/supabase/resetOperational";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada.", configured: false }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const confirm = String(body.confirm ?? "");
  if (confirm !== "ZERAR") {
    return NextResponse.json(
      { error: 'Envie { "confirm": "ZERAR" } para apagar entregas e lançamentos na nuvem.' },
      { status: 400 }
    );
  }

  const secret = process.env.ADMIN_RESET_SECRET;
  if (!secret || String(body.secret ?? "") !== secret) {
    return NextResponse.json({ error: "Segredo inválido." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const results =
    cnpj.length === 14
      ? [await resetOperationalCloudForCnpj(supabase, cnpj)]
      : await resetOperationalCloudAll(supabase);

  return NextResponse.json({
    success: true,
    operationalResetVersion: 4,
    results,
  });
}
