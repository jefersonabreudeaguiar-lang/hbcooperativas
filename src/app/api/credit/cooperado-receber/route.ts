import { NextResponse } from "next/server";
import { isCooperadoTransferenciaCreditoEnabled } from "@/config/cooperadoTransferenciaCredito";
import { resolveCreditAccountCooperadoIdForRequest } from "@/lib/hb-credit/resolveHbCreditApiCooperadoId";
import {
  cancelCooperadoTransferIntent,
  createCooperadoTransferIntent,
  pollCooperadoTransferIntentForReceiver,
  resolveCooperadoNomeForTransfer,
} from "@/lib/supabase/cooperadoTransferenciaCreditoStorage";
import {
  requireCreditApi,
  requireCreditCooperadoAccess,
  requireCreditCnpj,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { reaisToCents } from "@/modules/hb-credit/engine/money";
import { INTENT_MAX_CENTS } from "@/modules/hb-credit/config";

function featureDisabled() {
  return NextResponse.json({ error: "Transferência entre cooperados indisponível." }, { status: 404 });
}

export async function GET(request: Request) {
  if (!isCooperadoTransferenciaCreditoEnabled()) return featureDisabled();

  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const intentId = new URL(request.url).searchParams.get("intentId")?.trim() ?? "";
  const lite = new URL(request.url).searchParams.get("lite") === "1";
  if (!intentId) {
    return NextResponse.json({ error: "Cobrança inválida." }, { status: 400 });
  }

  const cnpj = normalizeCnpj(gate.ctx.session?.cooperativaCnpj ?? "");
  const cooperadoId = resolveCreditAccountCooperadoIdForRequest(
    gate.ctx,
    String(gate.ctx.session?.cooperadoId ?? "")
  );
  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denySelf = await requireCreditCooperadoAccess(gate.ctx, cooperadoId, cnpj);
  if (denySelf) return denySelf;

  const result = await pollCooperadoTransferIntentForReceiver(
    gate.ctx.supabase,
    intentId,
    cooperadoId,
    cnpj,
    { includeCpf: !lite }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, ...result.data });
}

export async function POST(request: Request) {
  if (!isCooperadoTransferenciaCreditoEnabled()) return featureDisabled();

  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "create");

  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const cooperadoId = resolveCreditAccountCooperadoIdForRequest(
    gate.ctx,
    String(body?.cooperadoId ?? gate.ctx.session?.cooperadoId ?? "")
  );
  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Sessão inválida." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denySelf = await requireCreditCooperadoAccess(gate.ctx, cooperadoId, cnpj);
  if (denySelf) return denySelf;

  if (action === "cancel") {
    const intentId = String(body?.intentId ?? "");
    if (!intentId) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    const result = await cancelCooperadoTransferIntent(gate.ctx.supabase, intentId, cooperadoId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const amountCents = Number(body?.amountCentavos ?? reaisToCents(Number(body?.amountReais ?? 0)));
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents !== Math.round(amountCents)) {
    return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  }
  if (amountCents > INTENT_MAX_CENTS) {
    return NextResponse.json({ error: "Valor acima do limite." }, { status: 400 });
  }

  const receiverNome =
    String(body?.receiverNome ?? "").trim() ||
    (await resolveCooperadoNomeForTransfer(gate.ctx.supabase, cnpj, cooperadoId));

  try {
    const { intent, qrPayload } = await createCooperadoTransferIntent(gate.ctx.supabase, {
      cooperativeCnpj: cnpj,
      receiverCooperadoId: cooperadoId,
      receiverNome,
      amountCents,
      descricao: body?.descricao ? String(body.descricao) : undefined,
      idempotencyKey: body?.idempotencyKey ? String(body.idempotencyKey) : undefined,
    });
    return NextResponse.json({ ok: true, intent, qrPayload });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao criar cobrança." },
      { status: 400 }
    );
  }
}
