import { saveHbCreditLimitsAtomic, type AtomicLimitOptions } from "@/lib/supabase/hbCreditAtomicLimits";
import { NextResponse } from "next/server";
import {
  getHbCreditLimitesRevision,
  listLimitesCooperadosAlinhadosComBase,
  previewLimiteAlteracao,
  previewLimiteColetivo,
  previewLimiteColetivoPercentual,
  resetCooperadoFinancialPin,
  setCooperadoBloqueado,
  resolveCreditosBaseForLiberacaoColetiva,
} from "@/lib/supabase/contaCoopStorage";
import { requireCreditApi, requireCreditCnpj, requireCreditStaff } from "@/lib/security/creditGuard";
import { normalizeCnpj } from "@/utils/cooperativa";
import { validateCreditosBaseCents } from "@/modules/hb-credit/engine/creditBaseValidation";
import { reaisToCents } from "@/modules/hb-credit/engine/money";

/** Sync completo (persist/resync) pode chamar BIC para muitos cooperados. */
export const maxDuration = 300;

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

  if (searchParams.get("view") === "revision") {
    const revision = await getHbCreditLimitesRevision(gate.ctx.supabase, cnpj);
    return NextResponse.json({ ok: true, revision });
  }

  const actorId = gate.ctx.session?.sub ?? "system";
  const resyncInflated = searchParams.get("resync") === "1";
  const fast = searchParams.get("fast") === "1";
  const persistFichaSync = searchParams.get("persist") === "1";
  const authoritativeCooperadoIds = (searchParams.get("cooperadoIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  try {
    const { limites, creditosBaseCents, authoritativeError } = await listLimitesCooperadosAlinhadosComBase(
      gate.ctx.supabase,
      cnpj,
      {
        resyncIfInflated: resyncInflated,
        persistFichaSync,
        actorUserId: actorId,
        fast,
        authoritativeCooperadoIds: authoritativeCooperadoIds.length ? authoritativeCooperadoIds : undefined,
      }
    );
    return NextResponse.json({
      ok: true,
      limites,
      creditosBaseAuthoritativeCents: creditosBaseCents,
      authoritativeError: authoritativeError ?? undefined,
    });
  } catch (e) {
    console.error("[GET /api/credit/limites]", e);
    const message = e instanceof Error ? e.message : "Erro ao carregar limites.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
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
    const saveAtomic = async (options: AtomicLimitOptions) => {
      const result = await saveHbCreditLimitsAtomic(gate.ctx.supabase, cnpj, actorId, options);
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error, code: result.code },
        { status: result.code === "OPERACIONAL_UNAVAILABLE" ? 503 : 400 });
      return NextResponse.json({ ok: true, updated: result.updated,
        creditosBaseAuthoritativeCents: result.creditosBaseCents,
        ...(action === "set_individual" ? { limite: result.limites[0] } : {}),
      });
    };

    const creditosValidation = validateCreditosBaseCents(body?.creditosBaseCents ?? {});
    if (!creditosValidation.ok) {
      return NextResponse.json({ error: creditosValidation.error, code: creditosValidation.code }, { status: 400 });
    }
    const clientCreditosBaseCents = creditosValidation.sanitized;

    const authoritativeBasesCache = new Map<
      string,
      Awaited<ReturnType<typeof resolveCreditosBaseForLiberacaoColetiva>>
    >();

    const resolveBasesForPost = async (cooperadoIds: string[]) => {
      const ids = cooperadoIds.filter(Boolean);
      if (!ids.length) {
        return { ok: true as const, creditosBaseCents: clientCreditosBaseCents };
      }
      const cacheKey = ids.slice().sort().join("|");
      const cached = authoritativeBasesCache.get(cacheKey);
      if (cached) return cached;
      const resolved = await resolveCreditosBaseForLiberacaoColetiva(
        gate.ctx.supabase,
        cnpj,
        ids,
        clientCreditosBaseCents
      );
      authoritativeBasesCache.set(cacheKey, resolved);
      return resolved;
    };

    const basesOrErrorResponse = async (cooperadoIds: string[]) => {
      const resolved = await resolveBasesForPost(cooperadoIds);
      if (!resolved.ok) {
        return {
          errorResponse: NextResponse.json(
            { error: resolved.message, code: resolved.code },
            { status: resolved.code === "OPERACIONAL_UNAVAILABLE" ? 503 : 400 }
          ),
        };
      }
      return { creditosBaseCents: resolved.creditosBaseCents };
    };

    if (action === "salvar_liberacao_percentual") {
      return await saveAtomic({ cooperadoIds: body?.cooperadoIds ?? [], percentual: Number(body?.percentual),
        tetoPercentual: Number(body?.tetoPercentual ?? body?.tetoPercent ?? body?.percentual) });
  }

    if (action === "set_teto") {
    return await saveAtomic({ cooperadoIds: [], tetoPercentual: Number(body?.tetoPercentual ?? body?.tetoPercent ?? 0), preservarPercentual: true });
  }

  if (action === "preview_individual") {
    const cooperadoId = String(body?.cooperadoId ?? "");
    const novoCents = Number(body?.novoLimiteCentavos ?? reaisToCents(Number(body?.novoLimiteReais ?? 0)));
    const basesPreview = await basesOrErrorResponse([cooperadoId]);
    if ("errorResponse" in basesPreview) return basesPreview.errorResponse;
    const creditosBaseCents = basesPreview.creditosBaseCents;
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
    return await saveAtomic({ cooperadoIds: [String(body?.cooperadoId ?? "")],
      valorFixoCents: Number(body?.novoLimiteCentavos ?? reaisToCents(Number(body?.novoLimiteReais ?? 0))), preservarPercentual: true });
  }

  if (action === "set_coletivo") {
    const percentual = Number(body?.percentual);
    return await saveAtomic({ cooperadoIds: body?.cooperadoIds ?? [],
      ...(Number.isFinite(percentual) ? { percentual } : {
        valorFixoCents: Number(body?.valorCentavos ?? reaisToCents(Number(body?.valorReais ?? 0))), preservarPercentual: true,
      }),
    });
  }

  if (action === "preview_coletivo") {
    const cooperadoIds = (body?.cooperadoIds ?? []) as string[];
    const basesPreviewColetivo = await basesOrErrorResponse(cooperadoIds);
    if ("errorResponse" in basesPreviewColetivo) return basesPreviewColetivo.errorResponse;
    const creditosBaseCents = basesPreviewColetivo.creditosBaseCents;
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

  if (action === "reset_cooperado_pin") {
    const cooperadoId = String(body?.cooperadoId ?? "");
    if (!cooperadoId) {
      return NextResponse.json({ error: "Cooperado inválido." }, { status: 400 });
    }
    const result = await resetCooperadoFinancialPin(
      gate.ctx.supabase,
      cnpj,
      cooperadoId,
      actorId
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/credit/limites]", e);
    const message = e instanceof Error ? e.message : "Erro ao processar limites.";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
