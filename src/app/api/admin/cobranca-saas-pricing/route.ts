import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  fetchCobrancaSaasPlatformSettings,
  saveCobrancaSaasPlatformSettings,
} from "@/lib/supabase/platformSettingsStorage";
import {
  COBRANCA_SAAS_DIA_COBRANCA_DEFAULT,
  COBRANCA_SAAS_MINIMO_MES_DEFAULT,
  COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
  resolveDiaCobrancaSaas,
  type CobrancaSaasPricing,
} from "@/services/cobrancaSaasService";
import { requireAdminRole, requireApiAuth } from "@/lib/security/apiGuard";

function parsePricingBody(body: unknown): CobrancaSaasPricing | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const precoCooperado = Number(raw.precoCooperado);
  const minimoMes = Number(raw.minimoMes);
  const diaRaw = raw.diaCobranca;
  if (!Number.isFinite(precoCooperado) || precoCooperado < 0) return null;
  if (!Number.isFinite(minimoMes) || minimoMes < 0) return null;
  const diaCobranca =
    diaRaw == null || diaRaw === ""
      ? COBRANCA_SAAS_DIA_COBRANCA_DEFAULT
      : Number(diaRaw);
  if (!Number.isFinite(diaCobranca) || diaCobranca < 1 || diaCobranca > 28) return null;
  return {
    precoCooperado: Math.round(precoCooperado * 100) / 100,
    minimoMes: Math.round(minimoMes * 100) / 100,
    diaCobranca: Math.floor(diaCobranca),
  };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      source: "default",
      pricing: {
        precoCooperado: COBRANCA_SAAS_PRECO_COOPERADO_DEFAULT,
        minimoMes: COBRANCA_SAAS_MINIMO_MES_DEFAULT,
        diaCobranca: COBRANCA_SAAS_DIA_COBRANCA_DEFAULT,
      },
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const pricing = await fetchCobrancaSaasPlatformSettings(supabase);
  return NextResponse.json({ ok: true, source: "cloud", pricing });
}

export async function PUT(request: Request) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;
  const adminDenied = requireAdminRole(auth.session, auth.enforced);
  if (adminDenied) return adminDenied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const pricing = parsePricingBody(body);
  if (!pricing) {
    return NextResponse.json(
      {
        ok: false,
        error: "Informe precoCooperado, minimoMes e diaCobranca válidos (dia 1–28).",
      },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      ok: true,
      source: "local_only",
      pricing: { ...pricing, diaCobranca: resolveDiaCobrancaSaas(pricing) },
      warning: "Nuvem não configurada — salve também no navegador pelo painel.",
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const saved = await saveCobrancaSaasPlatformSettings(supabase, pricing);
  if (!saved.ok) {
    return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, source: "cloud", pricing: saved.settings });
}
