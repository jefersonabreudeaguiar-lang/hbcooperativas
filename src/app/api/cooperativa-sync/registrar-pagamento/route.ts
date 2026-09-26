import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import { fetchOperacionalSync, uploadOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import type {
  ArquivoMensalCooperado,
  AjustesFichaMesCooperativa,
  Comunicado,
  LivroCaixaLancamento,
  PagamentoCooperadoRegistro,
} from "@/types";
import {
  aplicarRegistroPagamentoResponsavelNoOperacional,
  type RegistroPagamentoResponsavelPatch,
} from "@/services/pagamentoIntegridadeService";
import { markHbStaleBeforeOperacionalUpload } from "@/modules/hb-credit/engine/operationalAuthoritativeCreditBaseChange";
import { OPERATIONAL_RESET_VERSION } from "@/services/operationalReset";

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
  if (pagamento.status !== "aguardando_confirmacao") {
    return NextResponse.json({ error: "Pagamento deve estar aguardando assinatura." }, { status: 400 });
  }
  if ((pagamento.valorLiquido ?? 0) <= 0) {
    return NextResponse.json({ error: "Valor do pagamento inválido." }, { status: 400 });
  }

  const guard = await guardCooperativaApi(request, cnpj, {
    requireManagement: true,
    write: true,
    checkSaas: true,
  });
  if (!guard.ok) return guard.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 });
  }

  const operacional = await fetchOperacionalSync(supabase, cnpj);
  if (!operacional) {
    return NextResponse.json({ error: "Operacional não encontrado." }, { status: 404 });
  }

  const patch: RegistroPagamentoResponsavelPatch = {
    pagamento,
    comunicado: body?.comunicado as Comunicado | undefined,
    arquivosMensais: body?.arquivosMensais as ArquivoMensalCooperado[] | undefined,
    ajustesFichaMes: body?.ajustesFichaMes as AjustesFichaMesCooperativa[] | undefined,
    livroCaixa: body?.livroCaixa as LivroCaixaLancamento[] | undefined,
  };

  const staleGuard = await markHbStaleBeforeOperacionalUpload(supabase, {
    cnpj,
    nextOperacionalSanitized: operacional,
    actorUserId: guard.session?.sub ?? "registrar_pagamento",
    staleReason: "responsavel_registrar_pagamento",
    auditSession: guard.session,
  });
  if (!staleGuard.ok) {
    return NextResponse.json(
      { error: staleGuard.error, code: staleGuard.code ?? "HB_STALE_GUARD_FAILED" },
      { status: 503 }
    );
  }

  const next = {
    ...aplicarRegistroPagamentoResponsavelNoOperacional(operacional, patch),
    operationalResetVersion: OPERATIONAL_RESET_VERSION,
  };
  const uploaded = await uploadOperacionalSync(supabase, cnpj, next);
  if (!uploaded.ok) {
    return NextResponse.json({ error: uploaded.error }, { status: 500 });
  }

  if (guard.session) {
    await logServerMutationAudit(supabase, guard.session, cnpj, {
      action: "editar",
      entityType: "pagamento",
      entityId: pagamento.id,
      summary: "Responsável registrou pagamento na nuvem (API registrar-pagamento).",
    });
  }

  return NextResponse.json({ success: true, pagamentoId: pagamento.id }, { status: 201 });
}
