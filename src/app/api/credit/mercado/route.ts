import { NextResponse } from "next/server";
import {
  getParceiroByUserId,
  listIntentsParceiro,
  listRecebiveisParceiro,
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

  return NextResponse.json({ ok: true, parceiro, intents, recebiveis });
}
