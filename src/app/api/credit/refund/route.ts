import { NextResponse } from "next/server";
import { refundPayment } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const transacaoId = String(body?.transacaoId ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));

  if (!transacaoId || cnpj.length !== 14) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const result = await refundPayment(
    gate.ctx.supabase,
    transacaoId,
    cnpj,
    gate.ctx.session?.sub ?? "system"
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, disponivelAposCents: result.disponivelAposCents });
}
