import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import { guardCooperativaApi } from "@/lib/security/apiGuard";
import { logServerMutationAudit } from "@/lib/security/serverAudit";
import { fetchOperacionalSync, uploadOperacionalSync } from "@/lib/supabase/cooperativaSyncStorage";
import type { PagamentoCooperadoRegistro } from "@/types";
import { aplicarPagamentoConfirmadoNoOperacional } from "@/services/pagamentoIntegridadeService";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { syncHbLimitAfterCooperadoPayment } from "@/modules/hb-credit/engine/syncHbLimitAfterCooperadoPayment";
import { markHbCreditLimitStale } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
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

  const cooperadoId = pagamento.cooperadoId;
  const actorId = guard.session.sub ?? cooperadoId;

  const beforeBase = await resolveAuthoritativeCreditBase(supabase, cnpj, [cooperadoId]);
  const creditoBaseBeforeCents = beforeBase.ok ? beforeBase.creditosBaseCents[cooperadoId] ?? 0 : null;

  let paymentPersisted = false;
  let alreadyConfirmed = false;

  if (existente.status === "confirmado") {
    alreadyConfirmed = true;
    paymentPersisted = true;
  } else {
    const staleMark = await markHbCreditLimitStale(supabase, {
      cnpj,
      cooperadoId,
      actorUserId: actorId,
      reason: "cooperado_payment_before_operacional_upload",
    });
    if (!staleMark.ok) {
      return NextResponse.json({ error: staleMark.error, code: "HB_LIMIT_STALE_MARK_FAILED" }, { status: 503 });
    }

    const next = {
      ...aplicarPagamentoConfirmadoNoOperacional(operacional, pagamento),
      operationalResetVersion: OPERATIONAL_RESET_VERSION,
    };
    const uploaded = await uploadOperacionalSync(supabase, cnpj, next);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }
    paymentPersisted = true;

    if (guard.session) {
      await logServerMutationAudit(supabase, guard.session, cnpj, {
        action: "aprovar",
        entityType: "pagamento",
        entityId: pagamento.id,
        summary: "Cooperado confirmou pagamento e assinou recibo (API).",
      });
    }
  }

  const hbLimitSync = await syncHbLimitAfterCooperadoPayment(supabase, {
    cnpj,
    cooperadoId,
    paymentId: pagamento.id,
    actorUserId: actorId,
    creditoBaseBeforeCents,
  });

  return NextResponse.json(
    {
      success: true,
      already: alreadyConfirmed || undefined,
      paymentConfirmed: paymentPersisted,
      hbLimitSync: {
        status: hbLimitSync.status,
        reconciliationStatus: hbLimitSync.reconciliationStatus,
        creditoBaseBeforeCents: hbLimitSync.creditoBaseBeforeCents,
        creditoBaseAfterCents: hbLimitSync.creditoBaseAfterCents,
        limiteBeforeCents: hbLimitSync.limiteBeforeCents,
        limiteExpectedCents: hbLimitSync.limiteExpectedCents,
        limiteAfterCents: hbLimitSync.limiteAfterCents,
        errorCode: hbLimitSync.errorCode,
        errorMessage: hbLimitSync.errorMessage,
      },
    },
    { status: alreadyConfirmed ? 200 : 201 }
  );
}
