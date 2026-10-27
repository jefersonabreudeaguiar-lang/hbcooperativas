import { NextResponse } from "next/server";
import {
  archiveFichaPlanoEntregasCooperado,
  getFichaPlanoCooperado,
  saveFichaPlanoCooperado,
} from "@/lib/supabase/hbCreditFichaPlanoStorage";
import type { HbCreditFichaPlano } from "@/lib/hb-credit/hbCreditFichaPlano";
import { brutoFichaPlanoCents } from "@/lib/hb-credit/hbCreditFichaPlano";
import { getLimiteCooperadoExibicaoParidadeLimites } from "@/lib/supabase/contaCoopStorage";
import { resolveHbV2FichaLimiteExibicao } from "@/lib/hb-credit/hbCreditV2CooperadoLimiteExibicao";
import { isV2HbOnlyServer } from "@/lib/hb-credit/hbCreditV2LimiteBase";
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

  let plano = await getFichaPlanoCooperado(gate.ctx.supabase, cnpj, cooperadoId);
  const archivedCyclesCount = (plano.historicoCiclos ?? []).length;
  if (role === "cooperado") {
    plano = { ...plano, historicoCiclos: [] };
  }
  const brutoCents = brutoFichaPlanoCents(plano);
  let hbCredito: { valorLiberadoCents: number; liberacaoPercent: number | null } | null = null;
  if (isV2HbOnlyServer()) {
    const limite = await getLimiteCooperadoExibicaoParidadeLimites(
      gate.ctx.supabase,
      cnpj,
      cooperadoId
    );
    if (limite) {
      const capped = await resolveHbV2FichaLimiteExibicao(
        gate.ctx.supabase,
        cnpj,
        cooperadoId,
        limite,
        brutoCents
      );
      hbCredito = capped.exibicao;
    } else {
      hbCredito = { valorLiberadoCents: 0, liberacaoPercent: null };
    }
  }
  return NextResponse.json({ ok: true, plano, brutoCents, hbCredito, archivedCyclesCount });
}

export async function POST(request: Request) {
  const gate = await requireCreditApi(request, { requireOperations: true });
  if (!gate.ok) return gate.response;

  const denyStaff = requireCreditStaff(gate.ctx);
  if (denyStaff) return denyStaff;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  const cooperadoId = String(body?.cooperadoId ?? "");
  const action = String(body?.action ?? "save");
  const plano = body?.plano as HbCreditFichaPlano | undefined;

  if (cnpj.length !== 14 || !cooperadoId) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const actorId = gate.ctx.session?.sub ?? "staff";

  if (action === "archive_entregas") {
    const archived = await archiveFichaPlanoEntregasCooperado(
      gate.ctx.supabase,
      cnpj,
      cooperadoId,
      actorId
    );
    if (!archived.ok) return NextResponse.json({ error: archived.error }, { status: 400 });
    const outPlano = { ...archived.plano, historicoCiclos: archived.plano.historicoCiclos ?? [] };
    return NextResponse.json({
      ok: true,
      plano: outPlano,
      storageCooperadoId: archived.storageCooperadoId,
      archivedCyclesCount: outPlano.historicoCiclos.length,
    });
  }

  if (!plano) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }

  const saved = await saveFichaPlanoCooperado(gate.ctx.supabase, cnpj, { ...plano, cooperadoId }, actorId);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    plano: saved.plano,
    storageCooperadoId: saved.storageCooperadoId,
    limiteWarning: saved.limiteWarning ?? null,
  });
}
