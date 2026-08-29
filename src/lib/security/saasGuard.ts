import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CobrancaSaasCooperativa } from "@/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { normalizeCnpj } from "@/utils/cooperativa";
import type { SessionClaims } from "@/lib/security/jwt";

export async function fetchCooperativaSaasStatus(
  supabase: SupabaseClient,
  cnpj: string
): Promise<CobrancaSaasCooperativa | null> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return null;

  const { data, error } = await supabase
    .from("cooperativas")
    .select("cobranca_saas")
    .eq("cnpj", digits)
    .maybeSingle();

  if (error || !data?.cobranca_saas) return null;
  return data.cobranca_saas as CobrancaSaasCooperativa;
}

export function isCooperativaSaasBlocked(saas: CobrancaSaasCooperativa | null | undefined): boolean {
  return saas?.statusMes === "bloqueado";
}

function saasBypassRoles(session: SessionClaims): boolean {
  return session.role === "admin" || session.role === "tesoureiro";
}

export async function requireCooperativaSaasWritable(
  cnpj: string,
  session: SessionClaims | null,
  enforced: boolean
): Promise<NextResponse | null> {
  if (!enforced || !session) return null;
  if (saasBypassRoles(session)) return null;
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const saas = await fetchCooperativaSaasStatus(supabase, cnpj);
  if (!isCooperativaSaasBlocked(saas)) return null;

  return NextResponse.json(
    {
      error: "Cooperativa temporariamente bloqueada por inadimplência da mensalidade HB.",
      code: "SAAS_BLOCKED",
    },
    { status: 403 }
  );
}
