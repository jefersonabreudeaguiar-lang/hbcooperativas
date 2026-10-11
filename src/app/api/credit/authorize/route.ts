import { NextResponse } from "next/server";
import { projectContaCoopDescontosAfterHbAuthorize } from "@/lib/hb-credit/repairOperacionalContaCoopDescontos";
import { shouldProjectHbFichaBaseOnServer } from "@/lib/hb-credit/hbFichaBaseOperacional";
import {
  authorizePayment,
  parseQrPayload,
  prepareHbCreditPaymentAuthorize,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, resolveCreditPaymentCooperadoId } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import {
  HB_CREDIT_LIMIT_DIVERGENT_CODE,
  HB_CREDIT_STATE_STALE_CODE,
} from "@/modules/hb-credit/engine/hbCreditLimitSyncState";
import { isCooperadoTransferIntentId } from "@/config/cooperadoTransferenciaCredito";
import { authorizeCooperadoTransferPayment } from "@/lib/supabase/cooperadoTransferenciaCreditoStorage";

/** Autorização HB — RPC + PIN; precisa de folga acima do default serverless em sync pesado. */
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;
  const { supabase } = gate.ctx;

  const body = await request.json().catch(() => null);
  let cooperadoId = String(body?.cooperadoId ?? gate.ctx.session?.cooperadoId ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const pin = String(body?.pin ?? "");
  const idempotencyKey = String(body?.idempotencyKey ?? "");
  let intentId = String(body?.intentId ?? "");
  let nonce = String(body?.nonce ?? "");

  if (body?.qrPayload) {
    const parsed = parseQrPayload(String(body.qrPayload));
    if (!parsed) return NextResponse.json({ error: "Código inválido." }, { status: 400 });
    intentId = parsed.intentId;
    nonce = parsed.nonce;
  }

  if (cnpj.length !== 14 || !cooperadoId || !intentId || !nonce || !idempotencyKey) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }

  if (pin.length < FINANCIAL_PIN_MIN_LENGTH || !/^\d+$/.test(pin)) {
    return NextResponse.json({ error: "Informe o PIN financeiro." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const resolved = resolveCreditPaymentCooperadoId(gate.ctx, request, cooperadoId);
  if ("response" in resolved) return resolved.response;
  cooperadoId = resolved.cooperadoId;

  const actorId = gate.ctx.session?.sub ?? cooperadoId;

  async function ensureLimitePronto(): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
    const prep = await prepareHbCreditPaymentAuthorize(supabase, cnpj, cooperadoId, actorId);
    if (!prep.ok) {
      return { ok: false, error: prep.error, code: prep.code ?? "HB_LIMIT_PREPARE_FAILED" };
    }
    return { ok: true };
  }

  if (isCooperadoTransferIntentId(intentId)) {
    const prepareTransfer = await ensureLimitePronto();
    if (!prepareTransfer.ok) {
      return NextResponse.json(
        { error: prepareTransfer.error, code: prepareTransfer.code },
        { status: 503 }
      );
    }
    const result = await authorizeCooperadoTransferPayment(supabase, {
      intentId,
      nonce,
      payerCooperadoId: cooperadoId,
      cooperativeCnpj: cnpj,
      idempotencyKey,
      pin,
      actorUserId: gate.ctx.session?.sub ?? cooperadoId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }
    return NextResponse.json({
      ...result,
      ok: true,
      financeiroConfirmado: true,
      cooperadoTransfer: true,
    });
  }

  const payInput = {
    intentId,
    nonce,
    cooperadoId,
    cooperativaCnpj: cnpj,
    idempotencyKey,
    pin,
    actorUserId: gate.ctx.session?.sub ?? cooperadoId,
    cooperadoNome: String(body?.cooperadoNome ?? gate.ctx.session?.name ?? ""),
    useCashback: Boolean(body?.useCashback),
  };

  let result = await authorizePayment(supabase, payInput);

  const retryable =
    !result.ok &&
    (result.code === HB_CREDIT_STATE_STALE_CODE ||
      result.code === HB_CREDIT_LIMIT_DIVERGENT_CODE ||
      result.code === "HB_LIMIT_PREPARE_FAILED" ||
      result.code === "HB_CREDIT_LIMIT_SNAPSHOT_MISSING");
  if (retryable) {
    const prepAgain = await ensureLimitePronto();
    if (prepAgain.ok) {
      result = await authorizePayment(supabase, payInput);
    } else if (!result.ok) {
      return NextResponse.json(
        { error: prepAgain.error, code: prepAgain.code ?? "HB_LIMIT_PREPARE_FAILED" },
        { status: 503 }
      );
    }
  }

  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });

  const mesReferencia = String(body?.mesReferencia ?? "").trim() || undefined;
  if (shouldProjectHbFichaBaseOnServer()) {
    void projectContaCoopDescontosAfterHbAuthorize(supabase, cnpj, cooperadoId, {
      mesReferencia,
    }).catch(() => {});
  }

  return NextResponse.json({
    ...result,
    ok: true,
    financeiroConfirmado: true,
    projecaoPendente: true,
  });
  } catch (e) {
    console.error("[credit/authorize]", e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Não foi possível concluir o pagamento agora. Aguarde alguns segundos e tente de novo; se o PIN estava certo, confira o extrato antes de repetir.",
        code: "HB_AUTHORIZE_INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
