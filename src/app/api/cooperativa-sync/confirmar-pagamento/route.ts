import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import { fetchOperacionalSync, uploadOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import type { PagamentoCooperadoRegistro } from "@/types";
import { aplicarPagamentoConfirmadoNoOperacional } from "@/services/pagamentoIntegridadeService";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Nuvem não configurada.", configured: false }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? ""));
  const pagamento = body?.pagamento as PagamentoCooperadoRegistro | undefined;

  if (cnpj.length !== 14 || !pagamento?.id) {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  if (pagamento.status !== "confirmado" || !pagamento.assinaturaCooperado?.trim()) {
    return NextResponse.json({ error: "Pagamento confirmado inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, { write: true, checkSaas: true });
  if (!guard.ok) return guard.response;

  if (guard.session?.role !== "cooperado" || !guard.session.cooperadoId?.trim()) {
    return NextResponse.json({ error: "Somente o cooperado pode confirmar o recebimento." }, { status: 403 });
  }

  if (pagamento.cooperadoId !== guard.session.cooperadoId) {
    return NextResponse.json({ error: "Pagamento de outro cooperado." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const operacional = await fetchOperacionalSync(supabase, cnpj);
  if (!operacional) {
    return NextResponse.json({ error: "Operacional não encontrado." }, { status: 404 });
  }

  const existente = (operacional.pagamentosCooperado ?? []).find((p) => p.id === pagamento.id);
  if (!existente) {
    return NextResponse.json({ error: "Pagamento não encontrado na nuvem." }, { status: 404 });
  }
  if (existente.status === "confirmado") {
    return NextResponse.json({ success: true, already: true });
  }

  const next = aplicarPagamentoConfirmadoNoOperacional(operacional, pagamento);
  const uploaded = await uploadOperacionalSync(supabase, cnpj, next);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  if (guard.session) {
    await logServerMutationAudit(supabase, guard.session, cnpj, {
      action: "aprovar",
      entityType: "pagamento",
      entityId: pagamento.id,
      summary: "Cooperado confirmou pagamento e assinou recibo (API).",
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
