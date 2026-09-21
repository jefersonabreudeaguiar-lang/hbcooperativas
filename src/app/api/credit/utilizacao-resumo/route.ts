import { NextResponse } from "next/server";
import { listCooperadoHbUtilizacaoResumoAbateValorReceber } from "@/lib/supabase/contaCoopStorage";
import { enriquecerSaldosHbUtilizacao } from "@/lib/hb-credit/utilizacaoResumo";
import { requireCreditApi, requireCreditCnpj, requireCreditCooperado, requireCreditSettlementAccess } from "@/lib/security/creditGuard";

export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const cnpj = url.searchParams.get("cnpj") ?? "";
  const cooperadoId = url.searchParams.get("cooperadoId") ?? "";
  const cooperadoIdsParam = url.searchParams.get("cooperadoIds") ?? "";
  const mesReferencia = url.searchParams.get("mesReferencia") ?? "";
  const saldoBaseParam = url.searchParams.get("saldoBaseAReceber");

  if (!cnpj || !mesReferencia) {
    return NextResponse.json({ error: "Informe cnpj, cooperadoId e mesReferencia." }, { status: 400 });
  }

  const cooperadoIds = [
    ...new Set(
      [
        cooperadoId,
        ...cooperadoIdsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ].filter(Boolean)
    ),
  ];

  if (!cooperadoIds.length) {
    return NextResponse.json({ error: "Informe cooperadoId." }, { status: 400 });
  }

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  if (gate.ctx.enforced && gate.ctx.session?.role === "cooperado") {
    const sessionId = gate.ctx.session.cooperadoId ?? "";
    if (!sessionId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    if (cooperadoId && cooperadoId !== sessionId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    const extras = cooperadoIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id && id !== sessionId);
    cooperadoIds.splice(0, cooperadoIds.length, sessionId, ...extras);
  } else {
    for (const id of cooperadoIds) {
      const denySelf = requireCreditCooperado(gate.ctx, id);
      if (denySelf) return denySelf;
    }
  }

  let lancamentos = await listCooperadoHbUtilizacaoResumoAbateValorReceber(
    gate.ctx.supabase,
    cnpj,
    cooperadoIds,
    mesReferencia
  );

  const saldoBase = saldoBaseParam != null ? Number(saldoBaseParam) : NaN;
  if (Number.isFinite(saldoBase)) {
    lancamentos = enriquecerSaldosHbUtilizacao(lancamentos, saldoBase);
  }

  return NextResponse.json({ ok: true, lancamentos });
}
