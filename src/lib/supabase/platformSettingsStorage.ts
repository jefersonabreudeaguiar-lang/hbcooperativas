import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COBRANCA_SAAS_MINIMO_MES_DEFAULT,
  COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
  type CobrancaSaasPricing,
} from "@/services/cobrancaSaasService";

const SETTINGS_ROW_ID = "default";

export interface CobrancaSaasPlatformSettings extends CobrancaSaasPricing {
  updatedAt?: string;
}

function normalizePricing(raw: unknown): CobrancaSaasPlatformSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const preco =
    typeof obj.precoCooperado === "number" && obj.precoCooperado >= 0
      ? Math.round(obj.precoCooperado * 100) / 100
      : COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT;
  const minimo =
    typeof obj.minimoMes === "number" && obj.minimoMes >= 0
      ? Math.round(obj.minimoMes * 100) / 100
      : COBRANCA_SAAS_MINIMO_MES_DEFAULT;
  return {
    precoCooperado: preco,
    minimoMes: minimo,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
  };
}

export async function fetchCobrancaSaasPlatformSettings(
  supabase: SupabaseClient
): Promise<CobrancaSaasPlatformSettings> {
  const { data, error } = await supabase
    .from("hb_platform_settings")
    .select("cobranca_saas")
    .eq("id", SETTINGS_ROW_ID)
    .maybeSingle();

  if (error || !data?.cobranca_saas) {
    return {
      precoCooperado: COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
      minimoMes: COBRANCA_SAAS_MINIMO_MES_DEFAULT,
    };
  }

  return normalizePricing(data.cobranca_saas);
}

export async function saveCobrancaSaasPlatformSettings(
  supabase: SupabaseClient,
  pricing: CobrancaSaasPricing
): Promise<{ ok: true; settings: CobrancaSaasPlatformSettings } | { ok: false; error: string }> {
  const payload = {
    precoCooperado: pricing.precoCooperado,
    minimoMes: pricing.minimoMes,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("hb_platform_settings").upsert(
    {
      id: SETTINGS_ROW_ID,
      cobranca_saas: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, settings: payload };
}
