import { NextResponse } from "next/server";
import {
  assertHbCreditEnabledServer,
  assertHbCreditOperationsEnabled,
  CreditDisabledError,
  HbCreditDisabledError,
} from "@/modules/hb-credit/config";
import { requireApiAuth, requireCooperativaAccess, requireStaffRole } from "@/lib/security/apiGuard";
import type { SessionClaims } from "@/lib/security/jwt";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { getParceiroByUserId } from "@/lib/supabase/contaCoopStorage";
import type { ContaCoopParceiro } from "@/modules/hb-credit/types";

export type CreditAuthOk = {
  session: SessionClaims | null;
  enforced: boolean;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
};

export async function requireCreditApi(
  request: Request,
  options?: { requireOperations?: boolean }
): Promise<{ ok: true; ctx: CreditAuthOk } | { ok: false; response: NextResponse }> {
  try {
    assertHbCreditEnabledServer();
    if (options?.requireOperations) {
      assertHbCreditOperationsEnabled();
    }
  } catch (e) {
    if (e instanceof CreditDisabledError || e instanceof HbCreditDisabledError) {
      return { ok: false, response: NextResponse.json({ error: e.message, enabled: false }, { status: 404 }) };
    }
    throw e;
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, response: NextResponse.json({ error: "Nuvem não configurada." }, { status: 503 }) };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: "Cliente Supabase indisponível." }, { status: 503 }) };
  }

  const auth = await requireApiAuth(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  return { ok: true, ctx: { session: auth.session, enforced: auth.enforced, supabase } };
}

export function requireCreditCnpj(
  ctx: CreditAuthOk,
  cnpj: string
): NextResponse | null {
  return requireCooperativaAccess(ctx.session, cnpj, ctx.enforced);
}

/** Equipe da cooperativa (responsável, tesoureiro, admin). */
export function requireCreditResponsavel(ctx: CreditAuthOk): NextResponse | null {
  return requireStaffRole(ctx.session, ctx.enforced);
}

/** Conta Coop / estornos / limites — responsável ou tesoureiro (admin geral não). */
export function requireCreditCooperativeFinance(ctx: CreditAuthOk): NextResponse | null {
  if (!ctx.enforced || !ctx.session) return null;
  const role = ctx.session.role;
  if (role === "responsavel" || role === "tesoureiro") return null;
  return NextResponse.json(
    { error: "Ação restrita ao responsável ou tesoureiro da cooperativa." },
    { status: 403 }
  );
}

/** @deprecated alias */
export function requireCreditStaff(ctx: CreditAuthOk): NextResponse | null {
  return requireCreditCooperativeFinance(ctx);
}

export function requireCreditCooperado(
  ctx: CreditAuthOk,
  cooperadoId: string
): NextResponse | null {
  if (!ctx.enforced || !ctx.session) return null;
  if (ctx.session.role === "cooperado") {
    if (ctx.session.cooperadoId !== cooperadoId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }
    return null;
  }
  if (ctx.session.role === "parceiro") {
    return NextResponse.json({ error: "Ação restrita ao cooperado." }, { status: 403 });
  }
  return null;
}

export async function resolveCreditParceiro(
  ctx: CreditAuthOk
): Promise<ContaCoopParceiro | null> {
  if (!ctx.session?.sub) return null;
  return getParceiroByUserId(ctx.supabase, ctx.session.sub);
}

/** Valida parceiro autenticado — nunca confia em partner_id do cliente. */
export async function requireCreditParceiro(
  ctx: CreditAuthOk,
  clientParceiroId?: string
): Promise<{ ok: true; parceiro: ContaCoopParceiro } | { ok: false; response: NextResponse }> {
  if (!ctx.enforced || !ctx.session) {
    return { ok: false, response: NextResponse.json({ error: "Autenticação necessária." }, { status: 401 }) };
  }

  if (ctx.session.role !== "parceiro") {
    return { ok: false, response: NextResponse.json({ error: "Acesso restrito ao mercado parceiro." }, { status: 403 }) };
  }

  const parceiro = await resolveCreditParceiro(ctx);
  if (!parceiro) {
    return { ok: false, response: NextResponse.json({ error: "Mercado não vinculado." }, { status: 404 }) };
  }

  if (clientParceiroId && clientParceiroId !== parceiro.id) {
    return { ok: false, response: NextResponse.json({ error: "Sem permissão para este mercado." }, { status: 403 }) };
  }

  return { ok: true, parceiro };
}

/** Liquidação — mercado só a própria; equipe financeira só o CNPJ da sessão. */
export async function requireCreditSettlementAccess(
  ctx: CreditAuthOk,
  settlement: { cooperativeCnpj: string; partnerId: string }
): Promise<NextResponse | null> {
  if (!ctx.enforced || !ctx.session) return null;

  const denyCoop = requireCreditCnpj(ctx, settlement.cooperativeCnpj);
  if (denyCoop) return denyCoop;

  if (ctx.session.role === "parceiro") {
    const parceiro = await resolveCreditParceiro(ctx);
    if (!parceiro || parceiro.id !== settlement.partnerId) {
      return NextResponse.json({ error: "Sem permissão para esta liquidação." }, { status: 403 });
    }
    return null;
  }

  if (ctx.session.role === "responsavel" || ctx.session.role === "tesoureiro") {
    return null;
  }

  return NextResponse.json({ error: "Sem permissão para esta liquidação." }, { status: 403 });
}
