import { NextResponse } from "next/server";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditCooperado,
  requireCreditStaff,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { runOperationalLimitReconciliation } from "@/modules/hb-credit/engine/creditOperationalReconciliation";

/** Prévia read-only do crédito-base autoritativo (servidor) — sem alterar limites. */
export async function GET(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const cnpj = normalizeCnpj(String(url.searchParams.get("cnpj") ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

  const cooperadoIdsParam = url.searchParams.get("cooperadoIds") ?? url.searchParams.get("cooperadoId") ?? "";
  let cooperadoIds = cooperadoIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!cooperadoIds.length && gate.ctx.session?.cooperadoId) {
    cooperadoIds = [gate.ctx.session.cooperadoId];
  }

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

  const authoritative = await resolveAuthoritativeCreditBase(gate.ctx.supabase, cnpj, cooperadoIds);
  if (!authoritative.ok) {
    return NextResponse.json(
      { error: authoritative.message, code: authoritative.code },
      { status: authoritative.code === "OPERACIONAL_UNAVAILABLE" ? 503 : 400 }
    );
  }

  const includeHb = url.searchParams.get("includeHb") === "1";
  const operational = includeHb
    ? await runOperationalLimitReconciliation(gate.ctx.supabase, cnpj, cooperadoIds)
    : undefined;

  return NextResponse.json({
    ok: true,
    source: "authoritative_server",
    cooperativeCnpj: authoritative.cooperativeCnpj,
    cooperativaId: authoritative.cooperativaId,
    creditosBaseAuthoritativeCents: authoritative.creditosBaseCents,
    operational: operational
      ? {
          tetoPercent: operational.tetoPercent,
          issues: operational.issues,
        }
      : undefined,
  });
}
