import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkHbCreditPhase1SecuritySchema(supabase: SupabaseClient): Promise<{
  settlementsRlsOk: boolean;
  approveRefundRpcOk: boolean;
  ok: boolean;
}> {
  const { data: rlsRows, error: rlsError } = await supabase.rpc("hb_credit_approve_refund_request", {
    p_request_id: "__probe__",
    p_cooperative_cnpj: "00000000000000",
    p_reviewer_user_id: "probe",
    p_review_note: null,
    p_refund_transaction_id: "probe_tx",
    p_refund_id: "probe_ref",
  });

  const approveRefundRpcOk =
    !rlsError || !/function.*does not exist/i.test(rlsError.message ?? "");

  void rlsRows;

  const settlements = await supabase.from("hb_credit_settlements").select("id").limit(1);
  const settlementsRlsOk = !settlements.error || !/hb_credit_settlements/i.test(settlements.error.message ?? "");

  return {
    settlementsRlsOk,
    approveRefundRpcOk,
    ok: settlementsRlsOk && approveRefundRpcOk,
  };
}

/** Não reaplicar versões antigas da aprovação de estorno. */
export async function applyHbCreditPhase1SecuritySchemaSql(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Reparo legado desativado. Aplique somente as migrations atuais revisadas pelo processo de lançamento." };
}
