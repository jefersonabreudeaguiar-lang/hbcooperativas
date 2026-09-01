import { NextResponse } from "next/server";
import { listParceiros, setParceiroStatus } from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { ParceiroStatus } from "@/modules/hb-credit/types";
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

  const parceiros = await listParceiros(gate.ctx.supabase, cnpj);
  return NextResponse.json({ ok: true, parceiros });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const parceiroId = String(body?.parceiroId ?? "");
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
