import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { Cooperativa, MensalidadeConfig } from "@/types";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { cooperativaFromCloudRow, mensalidadeConfigComSenhaCadastro, mensalidadeConfigComSenhaAreaAdmin } from "@/utils/cooperativaCadastro";

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

  const guard = await guardCooperativaApi(request, cnpj, {
    requireManagement: true,
    write: true,
    checkSaas: false,
  });
  if (!guard.ok) return guard.response;

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
  if (body.senhaCadastroCooperado !== undefined) {
    const { data: atual } = await supabase
      .from("cooperativas")
      .select("mensalidade_config")
      .eq("cnpj", cnpj)
      .maybeSingle();
    const atualCfg = (atual?.mensalidade_config as MensalidadeConfig | null) ?? undefined;
    const mergedCfg =
      body.mensalidadeConfig != null
        ? (body.mensalidadeConfig as MensalidadeConfig)
        : atualCfg;
    patch.mensalidade_config = mensalidadeConfigComSenhaCadastro(
      mergedCfg,
      String(body.senhaCadastroCooperado ?? "").trim() || undefined
    );
  }
  if (body.senhaAreaAdminHash !== undefined) {
    const { data: atual } = await supabase
      .from("cooperativas")
      .select("mensalidade_config")
      .eq("cnpj", cnpj)
      .maybeSingle();
    const atualCfg = (patch.mensalidade_config as MensalidadeConfig | undefined)
      ?? ((atual?.mensalidade_config as MensalidadeConfig | null) ?? undefined);
    patch.mensalidade_config = mensalidadeConfigComSenhaAreaAdmin(
      atualCfg,
      String(body.senhaAreaAdminHash ?? "").trim() || undefined
    );
  }
  if (body.cobrancaSaas != null) {
    patch.cobranca_saas = body.cobrancaSaas;
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
  const cooperativa = cooperativaFromCloudRow(row);

  return NextResponse.json({ success: true, cooperativa });
}
