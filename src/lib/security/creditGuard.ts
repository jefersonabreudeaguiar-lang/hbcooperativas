import { NextResponse } from "next/server";
import { assertHbCreditEnabledServer, CreditDisabledError } from "@/modules/hb-credit/config";
import { requireApiAuth, requireCooperativaAccess, requireStaffRole } from "@/lib/security/apiGuard";
import type { SessionClaims } from "@/lib/security/jwt";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export type CreditAuthOk = {
  session: SessionClaims | null;
  enforced: boolean;
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
};

export async function requireCreditApi(
  request: Request
): Promise<{ ok: true; ctx: CreditAuthOk } | { ok: false; response: NextResponse }> {
  try {
    assertHbCreditEnabledServer();
  } catch (e) {
    if (e instanceof CreditDisabledError) {
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

export function requireCreditStaff(ctx: CreditAuthOk): NextResponse | null {
  return requireStaffRole(ctx.session, ctx.enforced);
}

export function requireCreditCooperado(
  ctx: CreditAuthOk,
  cooperadoId: string
): NextResponse | null {
  if (!ctx.enforced || !ctx.session) return null;
  if (ctx.session.role === "cooperado" && ctx.session.cooperadoId !== cooperadoId) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }
  return null;
}

export function requireCreditParceiro(ctx: CreditAuthOk, parceiroId: string): NextResponse | null {
  if (!ctx.enforced || !ctx.session) return null;
  if (ctx.session.role === "parceiro" && ctx.session.sub !== ctx.session.sub) {
    // parceiro_id stored in token - extend jwt later
  }
  if (ctx.session.role === "parceiro") {
    // validated per-route via getParceiroByUserId
  }
  return null;
}
