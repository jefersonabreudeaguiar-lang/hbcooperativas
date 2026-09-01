import { NextResponse } from "next/server";
import { confirmAppRepasse, getAppRepassePreview } from "@/lib/supabase/contaCoopStorage";
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

  const preview = await getAppRepassePreview(gate.ctx.supabase, cnpj, mesReferencia);
  return NextResponse.json({ ok: true, preview });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const mesReferencia = String(body?.mesReferencia ?? currentMesReferencia());
  const comprovanteMemo = body?.comprovanteMemo ? String(body.comprovanteMemo) : undefined;
  const responsavelNome = String(body?.responsavelNome ?? gate.ctx.session?.name ?? "Responsável");

  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const result = await confirmAppRepasse(gate.ctx.supabase, {
    cnpj,
    mesReferencia,
    responsavelUserId: gate.ctx.session?.sub ?? "system",
    responsavelNome,
    comprovanteMemo,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Falha ao confirmar repasse." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    repasse: result.repasse,
    livroCaixaOrigemId: result.livroCaixaOrigemId,
  });
}
