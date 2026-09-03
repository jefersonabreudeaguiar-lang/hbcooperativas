import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { resolveAuthorizedCooperadoId } from "@/lib/hb-credit/mobileCooperadoLink";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import { appendVotacaoVotoToOperacional } from "@/lib/supabase/votacaoSyncStorage";
import type { VotacaoVoto } from "@/types";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada.", configured: false }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const voto = body?.voto as VotacaoVoto | undefined;

  if (cnpj.length !== 14 || !voto?.pautaId || !voto?.cooperadoId || !voto?.voto) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { write: true, checkSaas: true });
  if (!guard.ok) return guard.response;

  const authCooperado = resolveAuthorizedCooperadoId(
    guard.session,
    request,
    voto.cooperadoId,
    guard.enforced
  );
  if (!authCooperado.ok) {
    return NextResponse.json({ error: authCooperado.error }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const merged: VotacaoVoto = {
    ...voto,
    cooperativaId: voto.cooperativaId,
    cooperadoId: authCooperado.cooperadoId,
    cooperadoNome: String(voto.cooperadoNome ?? "").trim() || "Cooperado",
    assinaturaDataUrl: String(voto.assinaturaDataUrl ?? "").trim(),
    createdAt: voto.createdAt || new Date().toISOString(),
  };

  if (!merged.assinaturaDataUrl) {
    return NextResponse.json({ error: "Assinatura obrigatória." }, { status: 400 });
  }

  const saved = await appendVotacaoVotoToOperacional(supabase, cnpj, merged);
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  if (guard.session) {
    await logServerMutationAudit(supabase, guard.session, cnpj, {
      action: "editar",
      entityType: "votacao_voto",
      entityId: merged.id,
      summary: `Voto registrado na pauta ${merged.pautaId}`,
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
