import { NextResponse } from "next/server";
import {
  acceptPartnerTerms,
  getCooperativaNomeByCnpj,
  getParceiroByUserId,
  hasPartnerFinancialPin,
  listIntentsParceiro,
  listRecebiveisParceiro,
  listSettlementsForPartner,
  partnerNeedsTermsAcceptance,
  setPartnerFinancialPin,
  updatePartnerPix,
} from "@/lib/supabase/contaCoopStorage";
import { countPartnerFiscalPending } from "@/lib/supabase/hbCreditFiscalNotesStorage";
import { getSettlementComprovanteSignedUrl } from "@/lib/supabase/hbCreditSettlementStorage";
import {
  assertPartnerPixEditable,
  consumeApprovedPartnerPixChangeRequest,
  getPartnerPixChangeStatus,
} from "@/lib/supabase/hbCreditPixChangeStorage";
import type { ContaCoopSettlement } from "@/modules/hb-credit/types";
import { requireCreditApi } from "@/lib/security/creditGuard";
import { FINANCIAL_PIN_MIN_LENGTH } from "@/modules/hb-credit/config";
import { getCurrentMesReferencia } from "@/utils/format";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
    return NextResponse.json({ error: "Acesso restrito ao mercado." }, { status: 403 });
  }

  const parceiro = gate.ctx.session
    ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
    : null;

  if (!parceiro) {
    return NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 });
  }

  const intents = await listIntentsParceiro(gate.ctx.supabase, parceiro.id);
  const recebiveis = await listRecebiveisParceiro(gate.ctx.supabase, parceiro.id);
  const settlementsRaw = await listSettlementsForPartner(gate.ctx.supabase, parceiro.id);
  const settlements: ContaCoopSettlement[] = await Promise.all(
    settlementsRaw.map(async (s) => {
      if (!s.comprovanteStoragePath) return s;
      const comprovanteUrl = await getSettlementComprovanteSignedUrl(
        gate.ctx.supabase,
        s.comprovanteStoragePath
      );
      return { ...s, comprovanteUrl };
    })
  );
  const hasPin = await hasPartnerFinancialPin(gate.ctx.supabase, parceiro.id);
  const mesReferencia = getCurrentMesReferencia();
  let fiscalPendentes = 0;
  try {
    fiscalPendentes = await countPartnerFiscalPending(gate.ctx.supabase, parceiro.id, mesReferencia);
  } catch {
    fiscalPendentes = 0;
  }

  const cooperativaNome =
    (await getCooperativaNomeByCnpj(gate.ctx.supabase, parceiro.cooperativaCnpj)) ?? "Cooperativa parceira";
  const needsTermsAcceptance = partnerNeedsTermsAcceptance(parceiro);
  const pixChange = await getPartnerPixChangeStatus(gate.ctx.supabase, parceiro.id);

  return NextResponse.json({
    ok: true,
    parceiro,
    intents,
    recebiveis,
    settlements,
    hasPin,
    fiscalPendentes,
    mesReferenciaFiscal: mesReferencia,
    cooperativaNome,
    needsTermsAcceptance,
    pixChange,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  if (gate.ctx.session?.role !== "parceiro" && gate.ctx.enforced) {
    return NextResponse.json({ error: "Acesso restrito ao mercado." }, { status: 403 });
  }

  const parceiro = gate.ctx.session
    ? await getParceiroByUserId(gate.ctx.supabase, gate.ctx.session.sub)
    : null;
  if (!parceiro) {
    return NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pixKey?: string;
    pixHolderName?: string;
    action?: string;
    pin?: string;
  };

  if (body.action === "set_pin") {
    const pin = String(body.pin ?? "");
    if (pin.length < FINANCIAL_PIN_MIN_LENGTH || !/^\d+$/.test(pin)) {
      return NextResponse.json(
        { error: `PIN numérico com mínimo ${FINANCIAL_PIN_MIN_LENGTH} dígitos.` },
        { status: 400 }
      );
    }
    const result = await setPartnerFinancialPin(gate.ctx.supabase, parceiro.id, pin);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, hasPin: true });
  }

  if (body.action === "accept_terms") {
    if (parceiro.status !== "ativo") {
      return NextResponse.json({ error: "Mercado ainda não está ativo." }, { status: 400 });
    }
    const updated = await acceptPartnerTerms(gate.ctx.supabase, parceiro.id, gate.ctx.session?.sub ?? "system");
    if (!updated) {
      return NextResponse.json({ error: "Não foi possível registrar o aceite do termo." }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      parceiro: updated,
      needsTermsAcceptance: partnerNeedsTermsAcceptance(updated),
    });
  }

  const pixKey = String(body.pixKey ?? "").trim();
  const pixHolderName = String(body.pixHolderName ?? "").trim();
  if (pixKey.length < 5) {
    return NextResponse.json({ error: "Informe uma chave PIX válida." }, { status: 400 });
  }
  if (!pixHolderName) {
    return NextResponse.json({ error: "Informe o titular da chave PIX." }, { status: 400 });
  }

  const editable = await assertPartnerPixEditable(gate.ctx.supabase, parceiro.id, parceiro.pixKey);
  if (!editable.ok) return NextResponse.json({ error: editable.error }, { status: 403 });

  const updated = await updatePartnerPix(gate.ctx.supabase, parceiro.id, pixKey, pixHolderName);
  if (!updated) return NextResponse.json({ error: "Não foi possível salvar o PIX." }, { status: 400 });

  if (!editable.isFirstRegistration) {
    await consumeApprovedPartnerPixChangeRequest(gate.ctx.supabase, parceiro.id);
  }

  return NextResponse.json({ ok: true, parceiro: updated });
}
