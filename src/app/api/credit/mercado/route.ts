import { NextResponse } from "next/server";
import {
  getParceiroByUserId,
  listIntentsParceiro,
  listRecebiveisParceiro,
  listSettlementsForPartner,
  updatePartnerPix,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi } from "@/lib/security/creditGuard";

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
  const settlements = await listSettlementsForPartner(gate.ctx.supabase, parceiro.id);

  return NextResponse.json({ ok: true, parceiro, intents, recebiveis, settlements });
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

  const body = (await request.json().catch(() => ({}))) as { pixKey?: string; pixHolderName?: string };
  const pixKey = String(body.pixKey ?? "").trim();
  const pixHolderName = String(body.pixHolderName ?? "").trim();
  if (pixKey.length < 5) {
    return NextResponse.json({ error: "Informe uma chave PIX válida." }, { status: 400 });
  }
  if (!pixHolderName) {
    return NextResponse.json({ error: "Informe o titular da chave PIX." }, { status: 400 });
  }

  const updated = await updatePartnerPix(gate.ctx.supabase, parceiro.id, pixKey, pixHolderName);
  if (!updated) return NextResponse.json({ error: "Não foi possível salvar o PIX." }, { status: 400 });
  return NextResponse.json({ ok: true, parceiro: updated });
}
