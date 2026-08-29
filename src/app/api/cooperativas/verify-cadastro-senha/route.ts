import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import { exigeSenhaCadastroCooperado, senhaCadastroStoredFromConfig } from "@/utils/cooperativaCadastro";
import { verifyPassword } from "@/lib/security/password";
import { rateLimitAuth } from "@/lib/security/rateLimit";

export async function POST(request: Request) {
  if (!rateLimitAuth(request)) {
    return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, valid: false, required: false }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const senha = String(body?.senha ?? "");

  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido.", valid: false }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false, valid: false, required: false }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("cooperativas")
    .select("mensalidade_config, status")
    .eq("cnpj", cnpj)
    .eq("status", "ativa")
    .maybeSingle();

  if (error) {
    if (isCooperativasTableMissing(error)) {
      return NextResponse.json({ configured: false, valid: false, required: false }, { status: 503 });
    }
    return NextResponse.json({ error: "Erro ao validar senha." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ valid: false, required: false, configured: true }, { status: 404 });
  }

  const cfg = data.mensalidade_config as Record<string, unknown> | null;
  const required = exigeSenhaCadastroCooperado(undefined, cfg);
  if (!required) {
    return NextResponse.json({ valid: true, required: false, configured: true });
  }

  const esperada = senhaCadastroStoredFromConfig(cfg) ?? "";
  const valid = await verifyPassword(senha.trim(), esperada);

  return NextResponse.json({ valid, required: true, configured: true });
}
