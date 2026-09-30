import { NextResponse } from "next/server";
import { syncLimitesCooperadosFromCreditoBase } from "@/lib/supabase/contaCoopStorage";
import {
  requireCreditApi,
  requireCreditCnpj,
  requireCreditCooperado,
  requireCreditStaff,
} from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  pickCreditosBaseForLimitSync,
  validateCreditosBaseCents,
} from "@/modules/hb-credit/engine/creditBaseValidation";
import { resolveAuthoritativeCreditBase } from "@/modules/hb-credit/engine/creditBaseAuthoritative";
import { markHbCreditLimitSynced } from "@/modules/hb-credit/engine/hbCreditLimitSyncState";

/**
 * Sincroniza limite HB = teto% × crédito-base.
 * Fase 1: crédito-base é sempre reconstruído no servidor (operacional + notas); cliente não decide o valor.
 */
export async function POST(request: Request) {
  const gate = await requireCreditApi(request);
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const cnpj = normalizeCnpj(String(body?.cnpj ?? gate.ctx.session?.cooperativaCnpj ?? ""));
  if (cnpj.length !== 14) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });

  const denyCoop = requireCreditCnpj(gate.ctx, cnpj);
  if (denyCoop) return denyCoop;

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

  let clientPreview: Record<string, number> | undefined;
  if (body?.creditosBaseCents != null) {
    const creditosValidation = validateCreditosBaseCents(body.creditosBaseCents, {
      allowedCooperadoIds: cooperadoIds,
    });
    if (!creditosValidation.ok) {
      return NextResponse.json({ error: creditosValidation.error, code: creditosValidation.code }, { status: 400 });
    }
    clientPreview = creditosValidation.sanitized;
  }

  const authoritativeResult = await resolveAuthoritativeCreditBase(
    gate.ctx.supabase,
    cnpj,
    cooperadoIds
  );

  if (!authoritativeResult.ok) {
    return NextResponse.json(
      {
        error: authoritativeResult.message,
        code: authoritativeResult.code,
      },
      { status: authoritativeResult.code === "OPERACIONAL_UNAVAILABLE" ? 503 : 400 }
    );
  }

  const picked = pickCreditosBaseForLimitSync({
    authoritative: authoritativeResult.creditosBaseCents,
    cooperadoIds,
    clientPreview,
  });

  const actorId = gate.ctx.session?.sub ?? "system";
  const result = await syncLimitesCooperadosFromCreditoBase(
    gate.ctx.supabase,
    cnpj,
    cooperadoIds,
    picked.creditosBaseCents,
    actorId
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  for (const cooperadoId of cooperadoIds) {
    const mark = await markHbCreditLimitSynced(gate.ctx.supabase, {
      cnpj,
      cooperadoId,
      actorUserId: actorId,
    });
    if (!mark.ok) {
      return NextResponse.json({ error: mark.error, code: "HB_LIMIT_SYNC_STATE_UPDATE_FAILED" }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok: true,
    source: "authoritative_server" as const,
    creditosBaseAuthoritativeCents: picked.creditosBaseCents,
    clientDivergences: picked.divergences.length ? picked.divergences : undefined,
    clientInflatedCooperados: picked.inflatedByClient.length ? picked.inflatedByClient : undefined,
    updated: result.updated,
    reset: result.reset,
    tightened: result.tightened,
    synced: result.synced,
    unchanged: result.unchanged,
    errors: result.errors,
    /** @deprecated use clientInflatedCooperados */
    clampedCooperados: picked.inflatedByClient.length ? picked.inflatedByClient : undefined,
  });
}
