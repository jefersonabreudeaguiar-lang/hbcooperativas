import { NextResponse } from "next/server";
import { authorizePayment, parseQrPayload } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCooperado, requireCreditCnpj } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const cooperadoId = String(body?.cooperadoId ?? gate.ctx.session?.cooperadoId ?? "");
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

  if (pin.length < FINANCIAL_PIN_MIN_LENGTH) {
    return NextResponse.json({ error: "Informe o PIN financeiro." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denySelf = requireCreditCooperado(gate.ctx, cooperadoId);
  if (denySelf) return denySelf;

  const result = await authorizePayment(gate.ctx.supabase, {
    intentId,
    nonce,
    cooperadoId,
    cooperativaCnpj: cnpj,
    idempotencyKey,
    pin,
    actorUserId: gate.ctx.session?.sub ?? cooperadoId,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
