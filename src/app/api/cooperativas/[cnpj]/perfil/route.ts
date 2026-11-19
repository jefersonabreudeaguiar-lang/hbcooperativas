import { NextResponse } from "next/server";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { mensalidadeConfigParaExibicao } from "@/utils/mensalidadeConfigPublica";

export const dynamic = "force-dynamic";

/** Perfil operacional para a sessão do próprio CNPJ, sem senhas ou hashes. */
export async function GET(request: Request, context: { params: Promise<{ cnpj: string }> }) {
  const { cnpj: raw } = await context.params;
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  const guard = await guardCooperativaApi(request, cnpj, { write: false, checkSaas: false });
  if (!guard.ok) return guard.response;
  if (!guard.session) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (guard.session.role === "parceiro") {
    return NextResponse.json({ error: "Perfil restrito à cooperativa." }, { status: 403 });
  }
  const client = getSupabaseAdmin();
  if (!client) return NextResponse.json({ error: "Nuvem indisponível." }, { status: 503 });
  const { data, error } = await client.from("cooperativas")
    .select("id, nome, cnpj, status, endereco, telefone, responsavel, email, created_at, mensalidade_config, updated_at")
    .eq("cnpj", cnpj).maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível atualizar o perfil." }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Cooperativa não encontrada." }, { status: 404 });
  return NextResponse.json({
    found: true,
    cooperativa: {
      id: data.id, nome: data.nome, cnpj: data.cnpj, status: data.status,
      endereco: data.endereco, telefone: data.telefone, responsavel: data.responsavel,
      email: data.email, created_at: data.created_at,
      mensalidade_config: mensalidadeConfigParaExibicao(data.mensalidade_config),
      updated_at: data.updated_at,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
