import { getMarketReceivableSnapshot } from "@/lib/supabase/hbCreditMarketReceivableSnapshot";
import { NextResponse } from "next/server";
import { listParceiros, resetPartnerFinancialPin, setParceiroStatus } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { apiParceiroStatus } from "@/modules/hb-credit/infrastructure/mappers/statusMapper";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  try {
    const [parceiros, snapshot] = await Promise.all([listParceiros(gate.ctx.supabase, cnpj), getMarketReceivableSnapshot(gate.ctx.supabase, cnpj)]);
    if (parceiros.length !== snapshot.summaries.length) throw new Error("Cadastro incompleto.");
    const completos = parceiros.map(p => {
      const recebiveisResumo = snapshot.summaries.find(s => s.partnerId === p.id);
      if (!recebiveisResumo) throw new Error("Saldo não consultado.");
      return { ...p, recebiveisResumo };
    });
    return NextResponse.json({ ok: true, parceiros: completos }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível conferir os recebíveis dos mercados na nuvem. Atualize novamente." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const parceiroId = String(body?.parceiroId ?? "");

  if (action === "reset_pin") {
    if (cnpj.length !== 14 || !parceiroId) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
    if (denyCoop) return denyCoop;
    const denyStaff = requireCreditStaff(gate.ctx);
    if (denyStaff) return denyStaff;

    const result = await resetPartnerFinancialPin(
      gate.ctx.supabase,
      cnpj,
      parceiroId,
      gate.ctx.session?.sub ?? "system"
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const rawStatus = String(body?.status ?? "");
  const status = apiParceiroStatus(rawStatus);
  const partnerDiscountPercent =
    body?.partnerDiscountPercent !== undefined ? Number(body.partnerDiscountPercent) : undefined;

  if (cnpj.length !== 14 || !parceiroId || !["ativo", "bloqueado"].includes(status)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (
    partnerDiscountPercent !== undefined &&
    (!Number.isFinite(partnerDiscountPercent) || partnerDiscountPercent < 0 || partnerDiscountPercent > 100)
  ) {
    return NextResponse.json({ error: "Percentual de desconto inválido (0–100)." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const updated = await setParceiroStatus(
    gate.ctx.supabase,
    cnpj,
    parceiroId,
    status,
    gate.ctx.session?.sub ?? "system",
    partnerDiscountPercent
  );
  if (!updated) return NextResponse.json({ error: "Parceiro não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, parceiro: updated });
}
