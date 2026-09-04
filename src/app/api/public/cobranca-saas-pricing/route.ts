import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { fetchCobrancaSaasPlatformSettings } from "@/lib/supabase/platformSettingsStorage";
import {
  COBRANCA_SAAS_MINIMO_MES_DEFAULT,
  COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
} from "@/services/cobrancaSaasService";

export async function GET() {
  const fallback = {
    precoCooperado: COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
    minimoMes: COBRANCA_SAAS_MINIMO_MES_DEFAULT,
  };

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, pricing: fallback });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, pricing: fallback });
  }

  const pricing = await fetchCobrancaSaasPlatformSettings(supabase);
  return NextResponse.json({ ok: true, pricing });
}
