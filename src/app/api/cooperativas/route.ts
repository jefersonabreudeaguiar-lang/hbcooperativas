import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { isCooperativasTableMissing } from "@/lib/supabase/errors";
import { normalizeCnpj } from "@/utils/cooperativa";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase não configurado.", configured: false },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const nome = String(body.nome ?? "").trim();
  const responsavel = String(body.responsavel ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const cnpj = normalizeCnpj(String(body.cnpj ?? ""));
  const telefone = String(body.telefone ?? "").trim();
  const endereco = String(body.endereco ?? "").trim();

  if (!nome) return NextResponse.json({ error: "Informe o nome da cooperativa." }, { status: 400 });
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  if (!responsavel) return NextResponse.json({ error: "Informe o responsável." }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const { data: existing } = await supabase
    .from("cooperativas")
    .select("id")
    .eq("cnpj", cnpj)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Este CNPJ já está cadastrado." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("cooperativas")
    .insert({
      nome,
      cnpj,
      responsavel,
      email,
      telefone,
      endereco,
      status: "ativa",
    })
    .select("id, nome, cnpj, endereco, telefone, responsavel, email, status, created_at, updated_at")
    .single();

  if (error) {
    console.error("[cooperativas/register]", error.message);
    if (isCooperativasTableMissing(error)) {
      return NextResponse.json(
        {
          error: "Crie a tabela cooperativas no Supabase antes de cadastrar.",
          migrationPending: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Erro ao salvar cooperativa na nuvem." }, { status: 500 });
  }

  return NextResponse.json({ success: true, cooperativa: data }, { status: 201 });
}
