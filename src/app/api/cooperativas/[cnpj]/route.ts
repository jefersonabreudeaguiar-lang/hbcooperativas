import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { Cooperativa, MensalidadeConfig } from "@/types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cnpj: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 });
  }

  const { cnpj: rawCnpj } = await context.params;
  const cnpj = normalizeCnpj(rawCnpj ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const patch: Record<string, unknown> = {};
  if (body.nome != null) patch.nome = String(body.nome).trim();
  if (body.endereco != null) patch.endereco = String(body.endereco);
  if (body.telefone != null) patch.telefone = String(body.telefone);
  if (body.responsavel != null) patch.responsavel = String(body.responsavel);
  if (body.email != null) patch.email = String(body.email).trim().toLowerCase();
  if (body.mensalidadeConfig != null) {
    patch.mensalidade_config = body.mensalidadeConfig as MensalidadeConfig;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cooperativas")
    .update(patch)
    .eq("cnpj", cnpj)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[cooperativas/patch]", error.message);
    return NextResponse.json({ error: "Erro ao atualizar cooperativa na nuvem." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Cooperativa não encontrada na nuvem." }, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const cooperativa: Cooperativa = {
    id: String(row.id),
    nome: String(row.nome),
    cnpj: normalizeCnpj(String(row.cnpj)),
    endereco: String(row.endereco ?? ""),
    telefone: String(row.telefone ?? ""),
    responsavel: String(row.responsavel ?? ""),
    email: String(row.email ?? ""),
    status: (row.status as Cooperativa["status"]) ?? "ativa",
    mensalidadeConfig: (row.mensalidade_config as MensalidadeConfig | null) ?? undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };

  return NextResponse.json({ success: true, cooperativa });
}
