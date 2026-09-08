import { NextResponse } from "next/server";
import {
  approvePartnerPixChangeRequest,
  createPartnerPixChangeRequest,
  denyPartnerPixChangeRequest,
  listPartnerPixChangeRequests,
} from "@/lib/supabase/hbCreditPixChangeStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditParceiro,
  requireCreditStaff,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);

  if (gate.ctx.session?.role === "parceiro") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;
    const solicitacoes = await listPartnerPixChangeRequests(gate.ctx.supabase, {
      partnerId: parceiroGate.parceiro.id,
      limit: 10,
    });
    return NextResponse.json({ ok: true, solicitacoes });
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
  const solicitacoes = await listPartnerPixChangeRequests(gate.ctx.supabase, {
    cooperativeCnpj: cnpj,
    status,
    limit: Number(searchParams.get("limit") ?? 50),
  });

  return NextResponse.json({ ok: true, solicitacoes });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "request") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;

    const result = await createPartnerPixChangeRequest(gate.ctx.supabase, {
      partnerId: parceiroGate.parceiro.id,
      cooperativeCnpj: parceiroGate.parceiro.cooperativaCnpj,
      requestedByUserId: gate.ctx.session?.sub,
      motivo: body.motivo ? String(body.motivo) : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, solicitacao: result.request });
  }

  const staffErr = requireCreditStaff(gate.ctx);
  if (staffErr) return staffErr;

  const cnpj = normalizeCnpj(String(body.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const requestId = String(body.requestId ?? "");
  if (!requestId) return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });

  const reviewerName = gate.ctx.session?.name ?? gate.ctx.session?.email ?? "Responsável";
  const reviewerUserId = gate.ctx.session?.sub ?? "staff";

  if (action === "approve") {
    const result = await approvePartnerPixChangeRequest(gate.ctx.supabase, {
      requestId,
      cooperativeCnpj: cnpj,
      reviewerUserId,
      reviewerName,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, solicitacao: result.request });
  }

  if (action === "deny") {
    const result = await denyPartnerPixChangeRequest(gate.ctx.supabase, {
      requestId,
      cooperativeCnpj: cnpj,
      reviewerUserId,
      reviewerName,
      reviewNote: body.reviewNote ? String(body.reviewNote) : undefined,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, solicitacao: result.request });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
