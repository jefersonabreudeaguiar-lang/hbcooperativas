import { NextResponse } from "next/server";
import { syncLimitesCooperadosFromCreditoBase } from "@/lib/supabase/contaCoopStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditCooperado,
  requireCreditStaff,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { validateCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseValidation";

/** Sincroniza limite Conta Coop = teto% × entregas pendentes na ficha. */
export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const creditosValidation = validateCreditosBaseCents(body?.creditosBaseCents ?? {});
  if (!creditosValidation.ok) {
    return NextResponse.json({ error: creditosValidation.error, code: creditosValidation.code }, { status: 400 });
  }
  const creditosBaseCents = creditosValidation.sanitized;

  const cooperadoIdsRaw = (body?.cooperadoIds ?? []) as unknown;
  const singleId = String(body?.cooperadoId ?? "").trim();
  const cooperadoIds = Array.isArray(cooperadoIdsRaw)
    ? cooperadoIdsRaw.map((id) => String(id)).filter(Boolean)
    : singleId
      ? [singleId]
      : [];

  if (!cooperadoIds.length) {
    return NextResponse.json({ error: "Informe cooperadoId ou cooperadoIds." }, { status: 400 });
  }

  const staffErr = requireCreditStaff(gate.ctx);
  if (staffErr) {
    if (cooperadoIds.length !== 1) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const denyCooperado = requireCreditCooperado(gate.ctx, cooperadoIds[0]);
    if (denyCooperado) return denyCooperado;
  }

  const actorId = gate.ctx.session?.sub ?? "system";
  const result = await syncLimitesCooperadosFromCreditoBase(
    gate.ctx.supabase,
    cnpj,
    cooperadoIds,
    creditosBaseCents,
    actorId
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, updated: result.updated, errors: result.errors });
}
