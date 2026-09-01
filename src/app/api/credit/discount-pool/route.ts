import { NextResponse } from "next/server";
import {
  getDiscountPoolResumo,
  listDiscountAllocations,
  sweepUnusedCashbackToCredit,
  updateParceiroDiscount,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";

function currentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  const mesReferencia = searchParams.get("mes") ?? currentMesReferencia();

  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const [resumo, allocations] = await Promise.all([
    getDiscountPoolResumo(gate.ctx.supabase, cnpj, mesReferencia),
    listDiscountAllocations(gate.ctx.supabase, cnpj, mesReferencia),
  ]);

  return NextResponse.json({ ok: true, resumo, allocations, mesReferencia });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));

  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  if (action === "update_partner_discount") {
    const parceiroId = String(body?.parceiroId ?? "");
    const percent = Number(body?.partnerDiscountPercent);
    if (!parceiroId || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return NextResponse.json({ error: "Percentual inválido (0–100)." }, { status: 400 });
    }
    const updated = await updateParceiroDiscount(
      gate.ctx.supabase,
      cnpj,
      parceiroId,
      percent,
      gate.ctx.session?.sub ?? "system"
    );
    if (!updated) return NextResponse.json({ error: "Mercado não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, parceiro: updated });
  }

  if (action === "sweep_cashback") {
    const mesReferencia = String(body?.mesReferencia ?? currentMesReferencia());
    const result = await sweepUnusedCashbackToCredit(
      gate.ctx.supabase,
      cnpj,
      mesReferencia,
      gate.ctx.session?.sub ?? "system"
    );
    if (!result.ok) return NextResponse.json({ error: result.error ?? "Falha ao converter cashback." }, { status: 400 });
    return NextResponse.json({
      ok: true,
      totalCents: result.totalCents,
      cooperados: result.cooperados,
    });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
