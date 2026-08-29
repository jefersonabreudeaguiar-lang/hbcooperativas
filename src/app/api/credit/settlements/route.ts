import { NextResponse } from "next/server";
import {
  confirmPartnerSettlement,
  getSettlementById,
  listCooperadoContaCoopDescontosMes,
  listSettlementsForPartner,
  previewPartnerSettlement,
  registerPartnerSettlementPayment,
} from "@/lib/supabase/contaCoopStorage";
import { gerarRelatorioLiquidacaoMercadoHtml, injetarAssinaturaMercadoNoRelatorio } from "@/utils/reciboLiquidacaoMercado";
import { encryptSensitiveField } from "@/lib/security/fieldCrypto";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditParceiro,
  requireCreditSettlementAccess,
  requireCreditStaff,
} from "@/lib/security/creditGuard";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const cnpj = url.searchParams.get("cnpj") ?? "";
  const partnerId = url.searchParams.get("partnerId") ?? "";
  const mesReferencia = url.searchParams.get("mesReferencia") ?? "";
  const settlementId = url.searchParams.get("settlementId") ?? "";

  if (settlementId) {
    const { data: row } = await gate.ctx.supabase
      .from("hb_credit_settlements")
      .select("id, cooperative_cnpj, partner_id")
      .eq("id", settlementId)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: "Liquidação não encontrada." }, { status: 404 });

    const denySettlement = await requireCreditSettlementAccess(gate.ctx, {
      cooperativeCnpj: String(row.cooperative_cnpj),
      partnerId: String(row.partner_id),
    });
    if (denySettlement) return denySettlement;

    const settlement = await getSettlementById(gate.ctx.supabase, settlementId);
    if (!settlement) return NextResponse.json({ error: "Liquidação não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, settlement });
  }

  if (gate.ctx.session?.role === "parceiro") {
    const parceiro = await requireCreditParceiro(gate.ctx);
    if (!parceiro.ok) return parceiro.response;
    const settlements = await listSettlementsForPartner(gate.ctx.supabase, parceiro.parceiro.id);
    return NextResponse.json({ ok: true, settlements });
  }

  const staffErr = requireCreditStaff(gate.ctx);
  if (staffErr) return staffErr;

  if (!cnpj || !partnerId || !mesReferencia) {
    return NextResponse.json({ error: "Informe cnpj, partnerId e mesReferencia." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const preview = await previewPartnerSettlement(gate.ctx.supabase, cnpj, partnerId, mesReferencia);
  if (!preview) return NextResponse.json({ error: "Mercado não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, preview });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "confirm_partner") {
    const parceiroGate = await requireCreditParceiro(gate.ctx);
    if (!parceiroGate.ok) return parceiroGate.response;
    const settlementId = String(body.settlementId ?? "");
    const assinatura = String(body.assinaturaDataUrl ?? "");
    if (!settlementId || !assinatura.trim()) {
      return NextResponse.json({ error: "Assinatura obrigatória." }, { status: 400 });
    }
    const result = await confirmPartnerSettlement(
      gate.ctx.supabase,
      settlementId,
      parceiroGate.parceiro.id,
      assinatura.trim()
    );
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Confirmação recusada." }, { status: 400 });

    const full = await getSettlementById(gate.ctx.supabase, settlementId);
    if (full?.relatorioHtml) {
      const html = injetarAssinaturaMercadoNoRelatorio(
        full.relatorioHtml,
        assinatura.trim(),
        new Date().toISOString()
      );
      await gate.ctx.supabase
        .from("hb_credit_settlements")
        .update({ relatorio_html: encryptSensitiveField(html) })
        .eq("id", settlementId);
    }

    return NextResponse.json({ ok: true, settlement: result.settlement });
  }

  const staffErr = requireCreditStaff(gate.ctx);
  if (staffErr) return staffErr;

  const cnpj = String(body.cnpj ?? "");
  const partnerId = String(body.partnerId ?? "");
  const mesReferencia = String(body.mesReferencia ?? "");
  const comprovanteMemo = body.comprovanteMemo ? String(body.comprovanteMemo) : undefined;
  const cooperativaNome = String(body.cooperativaNome ?? "Cooperativa");

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  if (action === "preview") {
    const preview = await previewPartnerSettlement(gate.ctx.supabase, cnpj, partnerId, mesReferencia);
    if (!preview) return NextResponse.json({ error: "Mercado não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, preview });
  }

  if (action === "register_payment") {
    const preview = await previewPartnerSettlement(gate.ctx.supabase, cnpj, partnerId, mesReferencia);
    if (!preview) return NextResponse.json({ error: "Mercado não encontrado." }, { status: 404 });

    const relatorioHtml = gerarRelatorioLiquidacaoMercadoHtml({
      cooperativaNome,
      preview,
      responsavelNome: gate.ctx.session?.name ?? gate.ctx.session?.email ?? "Responsável",
      comprovanteMemo,
      pagoEm: new Date().toISOString(),
    });

    const result = await registerPartnerSettlementPayment(gate.ctx.supabase, {
      cnpj,
      partnerId,
      mesReferencia,
      responsavelUserId: gate.ctx.session?.sub ?? "staff",
      responsavelNome: gate.ctx.session?.name ?? gate.ctx.session?.email ?? "Responsável",
      comprovanteMemo,
      relatorioHtml,
    });
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Pagamento não registrado." }, { status: 400 });
    return NextResponse.json({ ok: true, settlement: result.settlement });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
