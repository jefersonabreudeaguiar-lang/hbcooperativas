import { NextResponse } from "next/server";
import {
  approveRefundRequest,
  cancelRefundRequest,
  createRefundRequest,
  denyRefundRequest,
  listRefundablePayments,
  listRefundRequests,
  partnerNeedsTermsAcceptance,
} from "@/lib/supabase/contaCoopStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditParceiro,
  requireCreditStaff,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const role = gate.ctx.session?.role;

  if (role === "parceiro") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;

    const parceiro = parceiroGate.parceiro;
    const [compras, solicitacoes] = await Promise.all([
      listRefundablePayments(gate.ctx.supabase, parceiro.cooperativaCnpj, {
        partnerId: parceiro.id,
        limit: 30,
      }),
      listRefundRequests(gate.ctx.supabase, { partnerId: parceiro.id, limit: 30 }),
    ]);

    return NextResponse.json({ ok: true, compras, solicitacoes });
  }

  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const status = searchParams.get("status") === "pendente" ? "pendente" : undefined;
  const solicitacoes = await listRefundRequests(gate.ctx.supabase, {
    cooperativeCnpj: cnpj,
    status,
    limit: Number(searchParams.get("limit") ?? 50),
  });

  return NextResponse.json({ ok: true, solicitacoes });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "create") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;

    const transactionId = String(body?.transactionId ?? "");
    const motivo = String(body?.motivo ?? "");
    const pin = String(body?.pin ?? "");
    if (!transactionId) {
      return NextResponse.json({ error: "Compra inválida." }, { status: 400 });
    }
    if (pin.length < FINANCIAL_PIN_MIN_LENGTH) {
      return NextResponse.json({ error: "Informe seu PIN financeiro." }, { status: 400 });
    }

    if (partnerNeedsTermsAcceptance(parceiroGate.parceiro)) {
      return NextResponse.json(
        { error: "Aceite o Termo de Uso Conta Coop no painel do mercado antes de solicitar estorno." },
        { status: 400 }
      );
    }

    const result = await createRefundRequest(gate.ctx.supabase, {
      partnerId: parceiroGate.parceiro.id,
      transactionId,
      motivo,
      pin,
      requestedByUserId: gate.ctx.session?.sub ?? parceiroGate.parceiro.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, solicitacao: result.solicitacao });
  }

  if (action === "cancel") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;

    const requestId = String(body?.requestId ?? "");
    if (!requestId) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });

    const result = await cancelRefundRequest(gate.ctx.supabase, requestId, parceiroGate.parceiro.id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const requestId = String(body?.requestId ?? "");
  const reviewNote = body?.reviewNote ? String(body.reviewNote) : undefined;
  if (!requestId) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });

  if (action === "approve") {
    const result = await approveRefundRequest(
      gate.ctx.supabase,
      requestId,
      cnpj,
      gate.ctx.session?.sub ?? "system",
      reviewNote
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, disponivelAposCents: result.disponivelAposCents });
  }

  if (action === "deny") {
    const result = await denyRefundRequest(
      gate.ctx.supabase,
      requestId,
      cnpj,
      gate.ctx.session?.sub ?? "system",
      reviewNote
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
