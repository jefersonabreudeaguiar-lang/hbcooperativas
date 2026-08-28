import { NextResponse } from "next/server";
import {
  buildQrPayload,
  cancelPaymentIntent,
  createPaymentIntent,
  getParceiroByUserId,
  listIntentsParceiro,
  parseQrPayload,
  validateIntentForCooperado,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { reaisToCents } from "@/modules/hb-credit/engine/money";

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "create");

  if (action === "cancel") {
    if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
      return NextResponse.json({ error: "Ação restrita ao mercado parceiro." }, { status: 403 });
    }
    const parceiro = gate.ctx.session?.role === "parceiro"
      ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
      : null;
    const parceiroId = parceiro?.id ?? String(body?.parceiroId ?? "");
    const intentId = String(body?.intentId ?? "");
    if (!parceiroId || !intentId) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    const result = await cancelPaymentIntent(gate.ctx.supabase, intentId, parceiroId);
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

    const result = await validateIntentForCooperado(
      gate.ctx.supabase,
      parsed.intentId,
      parsed.nonce,
      cooperadoId,
      cnpj
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      valid: true,
      intent: result.intent,
      parceiroNome: result.parceiroNome,
      limite: result.limite,
    });
  }

  // create intent — parceiro only
  if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
    return NextResponse.json({ error: "Ação restrita ao mercado parceiro." }, { status: 403 });
  }

  const parceiro =
    gate.ctx.session?.role === "parceiro"
      ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
      : null;

  const parceiroId = parceiro?.id ?? String(body?.parceiroId ?? "");
  const cnpj = normalizeCnpj(parceiro?.cooperativaCnpj ?? String(body?.cnpj ?? ""));
  const amountCents = Number(body?.amountCentavos ?? reaisToCents(Number(body?.amountReais ?? 0)));

  if (!parceiroId || cnpj.length !== 14 || amountCents <= 0) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  try {
    const intent = await createPaymentIntent(gate.ctx.supabase, {
      parceiroId,
      cooperativaCnpj: cnpj,
      amountCents,
      descricao: body?.descricao ? String(body.descricao) : undefined,
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
