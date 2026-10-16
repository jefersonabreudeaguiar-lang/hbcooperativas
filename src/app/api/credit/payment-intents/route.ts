import { NextResponse } from "next/server";
import {
  buildQrPayload,
  cancelPaymentIntent,
  createPaymentIntent,
  getPartnerPaymentIntentStatus,
  parseQrPayload,
  prepareHbCreditPaymentAuthorize,
  resolveHbCreditPayCooperadoId,
  validateIntentForCooperado,
} from "@/lib/supabase/contaCoopStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditParceiro,
  resolveCreditPaymentCooperadoId,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { reaisToCents } from "@/modules/hb-credit/engine/money";
import { INTENT_MAX_CENTS } from "@/modules/hb-credit/config";
import { HB_CREDIT_INSUFFICIENT_CODE } from "@/modules/hb-credit/engine/paymentAffordability";
import { isCooperadoTransferIntentId } from "@/config/cooperadoTransferenciaCredito";
import {
  resolveCooperadoNomeForTransfer,
  validateCooperadoTransferForPayer,
} from "@/lib/supabase/cooperadoTransferenciaCreditoStorage";

/** Validação QR + prepare de limite podem reconciliar M6 em paralelo. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const intentId = new URL(request.url).searchParams.get("intentId")?.trim() ?? "";
  const lite = new URL(request.url).searchParams.get("lite") === "1";
  if (!intentId) {
    return NextResponse.json({ error: "Cobrança inválida." }, { status: 400 });
  }

  const parceiroGate = await requireCreditParceiro(gate.ctx);
  if (!parceiroGate.ok) return parceiroGate.response;

  const result = await getPartnerPaymentIntentStatus(
    gate.ctx.supabase,
    parceiroGate.parceiro.id,
    intentId,
    { lite }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(
    { ok: true, ...result.data },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "create");

  if (action === "cancel") {
    const parceiroGate = await requireCreditParceiro(gate.ctx, String(body?.parceiroId ?? ""));
    if (!parceiroGate.ok) return parceiroGate.response;

    const intentId = String(body?.intentId ?? "");
    if (!intentId) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const result = await cancelPaymentIntent(gate.ctx.supabase, intentId, parceiroGate.parceiro.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "validate") {
    const qrPayload = String(body?.qrPayload ?? "");
    const parsed = parseQrPayload(qrPayload);
    if (!parsed) return NextResponse.json({ error: "Código inválido." }, { status: 400 });

    const cooperadoId = String(body?.cooperadoId ?? gate.ctx.session?.cooperadoId ?? "");
    const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
    if (!cooperadoId || cnpj.length !== 14) {
      return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
    }

    const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
    if (denyCoop) return denyCoop;

    const resolved = resolveCreditPaymentCooperadoId(gate.ctx, request, cooperadoId);
    if ("response" in resolved) return resolved.response;

    const payCooperadoId = await resolveHbCreditPayCooperadoId(
      gate.ctx.supabase,
      cnpj,
      resolved.cooperadoId
    );

    const actorId = gate.ctx.session?.sub ?? payCooperadoId;
    const clientWantsFast = body?.fast !== false;

    const runPrepare = () =>
      prepareHbCreditPaymentAuthorize(gate.ctx.supabase, cnpj, payCooperadoId, actorId);

    if (isCooperadoTransferIntentId(parsed.intentId)) {
      const prepare = await runPrepare();
      if (!prepare.ok) {
        return NextResponse.json(
          { ok: false, error: prepare.error, code: prepare.code ?? "HB_LIMIT_PREPARE_FAILED" },
          { status: 503 }
        );
      }
      const { data: intentRow } = await gate.ctx.supabase
        .from("hb_credit_cooperado_transfer_intents")
        .select("receiver_cooperado_id")
        .eq("id", parsed.intentId)
        .maybeSingle();
      const receiverId = intentRow ? String(intentRow.receiver_cooperado_id) : "";
      const nome = receiverId
        ? await resolveCooperadoNomeForTransfer(gate.ctx.supabase, cnpj, receiverId)
        : "Cooperado";

      const transferResult = await validateCooperadoTransferForPayer(gate.ctx.supabase, {
        intentId: parsed.intentId,
        nonce: parsed.nonce,
        payerCooperadoId: payCooperadoId,
        cooperativeCnpj: cnpj,
        receiverNome: nome,
      });
      if (!transferResult.ok) {
        return NextResponse.json(
          { ok: false, error: transferResult.error, code: transferResult.code },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        valid: true,
        intent: transferResult.intent,
        parceiroNome: transferResult.parceiroNome,
        limite: transferResult.limite,
        cooperadoTransfer: true,
      });
    }

    if (clientWantsFast) {
      /** Híbrido: mercado + valor na tela antes do reconcile M6; prepare aquece authorize em paralelo. */
      const prepareInBackground = runPrepare();
      let result = await validateIntentForCooperado(
        gate.ctx.supabase,
        parsed.intentId,
        parsed.nonce,
        payCooperadoId,
        cnpj,
        { fast: true }
      );
      if (!result.ok && result.code === HB_CREDIT_INSUFFICIENT_CODE) {
        const prepare = await prepareInBackground;
        if (!prepare.ok) {
          return NextResponse.json(
            { ok: false, error: prepare.error, code: prepare.code ?? "HB_LIMIT_PREPARE_FAILED" },
            { status: 503 }
          );
        }
        result = await validateIntentForCooperado(
          gate.ctx.supabase,
          parsed.intentId,
          parsed.nonce,
          payCooperadoId,
          cnpj,
          { fast: false }
        );
      } else if (result.ok) {
        void prepareInBackground.catch(() => {});
      }
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        valid: true,
        intent: result.intent,
        parceiroNome: result.parceiroNome,
        limite: result.limite,
      });
    }

    const prepare = await runPrepare();
    if (!prepare.ok) {
      return NextResponse.json(
        { ok: false, error: prepare.error, code: prepare.code ?? "HB_LIMIT_PREPARE_FAILED" },
        { status: 503 }
      );
    }

    const result = await validateIntentForCooperado(
      gate.ctx.supabase,
      parsed.intentId,
      parsed.nonce,
      payCooperadoId,
      cnpj,
      { fast: false }
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      valid: true,
      intent: result.intent,
      parceiroNome: result.parceiroNome,
      limite: result.limite,
    });
  }

  const parceiroGate = await requireCreditParceiro(gate.ctx, String(body?.parceiroId ?? ""));
  if (!parceiroGate.ok) return parceiroGate.response;

  const parceiro = parceiroGate.parceiro;
  const cnpj = normalizeCnpj(parceiro.cooperativaCnpj);
  const amountCents = Number(body?.amountCentavos ?? reaisToCents(Number(body?.amountReais ?? 0)));

  if (cnpj.length !== 14 || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (amountCents !== Math.round(amountCents) || amountCents > INTENT_MAX_CENTS) {
    return NextResponse.json({ error: "Valor da cobrança inválido ou acima do limite." }, { status: 400 });
  }

  try {
    const intent = await createPaymentIntent(gate.ctx.supabase, {
      parceiroId: parceiro.id,
      cooperativaCnpj: cnpj,
      amountCents,
      descricao: body?.descricao ? String(body.descricao) : undefined,
      idempotencyKey: body?.idempotencyKey ? String(body.idempotencyKey) : undefined,
      parceiroNome: parceiro.nomeMercado,
    });
    return NextResponse.json({
      ok: true,
      intent,
      qrPayload: buildQrPayload(intent.id, intent.nonce),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao criar cobrança." }, { status: 400 });
  }
}
