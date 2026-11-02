import type { SupabaseClient } from "@supabase/supabase-js";

/** O banco confere confirmação, mercado e vendas vinculadas antes de liquidar. */
export async function liquidateConfirmedSettlementDiscounts(
  supabase: SupabaseClient,
  input: { cnpj: string; mesReferencia: string; settlementId: string; actorUserId: string },
): Promise<{ ok: boolean; error?: string }> {
  const failure = "Não foi possível confirmar os descontos desta liquidação. Tente novamente.";
  if (!/^\d{14}$/.test(input.cnpj) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.mesReferencia)
    || !input.settlementId || !input.actorUserId) return { ok: false, error: failure };
  try {
    const { data, error } = await supabase.rpc("hb_credit_liquidate_discount_pool", {
      p_cooperative_cnpj: input.cnpj,
      p_mes_referencia: input.mesReferencia,
      p_settlement_id: input.settlementId,
      p_actor_user_id: input.actorUserId,
    });
    if (error || !data || data.ok !== true) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : failure };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: failure };
  }
}
