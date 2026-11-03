import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkHbCreditCooperadoTransferSchema(supabase: SupabaseClient): Promise<{
  intentsTableOk: boolean;
  rpcOk: boolean;
  ok: boolean;
}> {
  const intents = await supabase.from("hb_credit_cooperado_transfer_intents").select("id").limit(1);
  const intentsTableOk =
    !intents.error || !/hb_credit_cooperado_transfer_intents/i.test(intents.error.message ?? "");

  const { error: rpcError } = await supabase.rpc("hb_credit_authorize_cooperado_transfer", {
    p_intent_id: "__schema_probe__",
    p_nonce: "x",
    p_payer_cooperado_id: "x",
    p_cooperative_cnpj: "00000000000000",
    p_idempotency_key: "probe",
    p_receipt_code: "X",
  });
  const rpcOk =
    !rpcError ||
    (!/function.*does not exist/i.test(rpcError.message) &&
      !/hb_credit_authorize_cooperado_transfer/i.test(rpcError.message ?? ""));

  return {
    intentsTableOk,
    rpcOk,
    ok: intentsTableOk && rpcOk,
  };
}

/** Não reaplicar a RPC antiga sobre saldo próprio/idempotência atuais. */
export async function applyHbCreditCooperadoTransferSchemaSql(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Reparo legado desativado. Aplique somente as migrations atuais revisadas pelo processo de lançamento." };
}
