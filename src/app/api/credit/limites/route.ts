import { NextResponse } from "next/server";
import {
  listLimitesCooperados,
  previewLimiteAlteracao,
  previewLimiteColetivo,
  previewLimiteColetivoPercentual,
  setCooperadoBloqueado,
  setLimiteColetivo,
  setLimiteColetivoPercentual,
  setLimiteCooperado,
  setTetoGlobalPercent,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { validateCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseValidation";
import { reaisToCents } from "@/modules/hb-credit/engine/money";

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

  const limites = await listLimitesCooperados(gate.ctx.supabase, cnpj);
  return NextResponse.json({ ok: true, limites });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;
  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const actorId = gate.ctx.session?.sub ?? "system";
  const creditosValidation = validateCreditosBaseCents(body?.creditosBaseCents ?? {});
  if (!creditosValidation.ok) {
    return NextResponse.json({ error: creditosValidation.error, code: creditosValidation.code }, { status: 400 });
  }
  const creditosBaseCents = creditosValidation.sanitized;

  if (action === "set_teto") {
    const tetoPercent = Number(body?.tetoPercentual ?? body?.tetoPercent ?? 0);
    const result = await setTetoGlobalPercent(
      gate.ctx.supabase,
      cnpj,
      tetoPercent,
      creditosBaseCents,
      actorId
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "preview_individual") {
    const cooperadoId = String(body?.cooperadoId ?? "");
    const novoCents = Number(body?.novoLimiteCentavos ?? reaisToCents(Number(body?.novoLimiteReais ?? 0)));
    const preview = await previewLimiteAlteracao(
      gate.ctx.supabase,
      cnpj,
      cooperadoId,
      novoCents,
      creditosBaseCents
    );
    return NextResponse.json({ ok: true, preview });
  }

  if (action === "set_individual") {
    const cooperadoId = String(body?.cooperadoId ?? "");
    const novoCents = Number(body?.novoLimiteCentavos ?? reaisToCents(Number(body?.novoLimiteReais ?? 0)));
    const result = await setLimiteCooperado(
      gate.ctx.supabase,
      cnpj,
      cooperadoId,
      novoCents,
      actorId,
      creditosBaseCents
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, limite: result.limite });
  }

  if (action === "set_coletivo") {
    const cooperadoIds = (body?.cooperadoIds ?? []) as string[];
    const percentual = Number(body?.percentual);
    if (Number.isFinite(percentual)) {
      const result = await setLimiteColetivoPercentual(
        gate.ctx.supabase,
        cnpj,
        cooperadoIds,
        percentual,
        creditosBaseCents,
        actorId
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, updated: result.updated });
    }
    const valorCents = Number(body?.valorCentavos ?? reaisToCents(Number(body?.valorReais ?? 0)));
    const result = await setLimiteColetivo(
      gate.ctx.supabase,
      cnpj,
      cooperadoIds,
      valorCents,
      actorId,
      creditosBaseCents
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, updated: result.updated });
  }

  if (action === "preview_coletivo") {
    const cooperadoIds = (body?.cooperadoIds ?? []) as string[];
    const percentual = Number(body?.percentual);
    if (Number.isFinite(percentual)) {
      const preview = await previewLimiteColetivoPercentual(
        gate.ctx.supabase,
        cnpj,
        cooperadoIds,
        percentual,
        creditosBaseCents
      );
      return NextResponse.json({ ok: true, preview });
    }
    const valorCents = Number(body?.valorCentavos ?? reaisToCents(Number(body?.valorReais ?? 0)));
    const preview = await previewLimiteColetivo(
      gate.ctx.supabase,
      cnpj,
      cooperadoIds,
      valorCents,
      creditosBaseCents
    );
    return NextResponse.json({ ok: true, preview });
  }

  if (action === "set_bloqueado") {
    const cooperadoId = String(body?.cooperadoId ?? "");
    const bloqueado = Boolean(body?.bloqueado);
    const result = await setCooperadoBloqueado(gate.ctx.supabase, cnpj, cooperadoId, bloqueado, actorId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
