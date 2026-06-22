import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { getSupabasePublic, isSupabasePublicConfigured } from "@/lib/supabase/public";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";
import { exigeSenhaCadastroCooperado, mensalidadeConfigSemSenhaCadastro } from "@/utils/cooperativaCadastro";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? "");

  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  if (!isSupabaseConfigured() && !isSupabasePublicConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado.", configured: false },
      { status: 503 }
    );
  }

  const client = getSupabaseAdmin() ?? getSupabasePublic();
  if (!client) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const { data, error } = await client
    .from("cooperativas")
    .select("id, nome, cnpj, endereco, telefone, responsavel, email, status, mensalidade_config, created_at, updated_at")
    .eq("cnpj", cnpj)
    .eq("status", "ativa")
    .maybeSingle();

  if (error) {
    console.error("[cooperativas/lookup]", error.message);
    if (isCooperativasTableMissing(error)) {
      return NextResponse.json(
        { error: "Tabela cooperativas não criada no Supabase.", migrationPending: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Erro ao consultar CNPJ." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const cfg = data.mensalidade_config as Record<string, unknown> | null;
  const exigeSenha = exigeSenhaCadastroCooperado(undefined, cfg);
  const cooperativaPublica = {
    ...data,
    mensalidade_config: mensalidadeConfigSemSenhaCadastro(cfg) ?? null,
  };

  return NextResponse.json({ found: true, cooperativa: cooperativaPublica, exigeSenhaCadastro: exigeSenha });
}
