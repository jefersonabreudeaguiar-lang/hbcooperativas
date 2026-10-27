import { NextResponse } from "next/server";
import {
  getFichaPlanoCooperado,
  saveFichaPlanoCooperado,
} from "@/lib/supabase/hbCreditFichaPlanoStorage";
import type { HbCreditFichaPlano } from "@/lib/hb-credit/hbCreditFichaPlano";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditStaff,
  resolveCreditPaymentCooperadoId,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(request.url);
  const cnpj = normalizeCnpj(searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? "");
  let cooperadoId = String(searchParams.get("cooperadoId") ?? gate.ctx.session?.cooperadoId ?? "");
  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "CNPJ ou cooperado inválido." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const role = String(gate.ctx.session?.role ?? "").toLowerCase();
  if (role === "cooperado") {
    const resolved = resolveCreditPaymentCooperadoId(gate.ctx, request, cooperadoId);
    if ("response" in resolved) return resolved.response;
    cooperadoId = resolved.cooperadoId;
  } else {
    const denyStaff = requireCreditStaff(gate.ctx);
    if (denyStaff) return denyStaff;
  }

  const plano = await getFichaPlanoCooperado(gate.ctx.supabase, cnpj, cooperadoId);
  return NextResponse.json({ ok: true, plano });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const cooperadoId = String(body?.cooperadoId ?? "");
  const plano = body?.plano as HbCreditFichaPlano | undefined;

  if (cnpj.length !== 14 || !cooperadoId || !plano) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const actorId = gate.ctx.session?.sub ?? "staff";
  const saved = await saveFichaPlanoCooperado(gate.ctx.supabase, cnpj, { ...plano, cooperadoId }, actorId);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json({ ok: true, plano: saved.plano });
}
