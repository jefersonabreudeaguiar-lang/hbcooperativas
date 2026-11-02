import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { liquidateConfirmedSettlementDiscounts } from "../src/lib/supabase/hbCreditDiscountSettlement";

const input = { cnpj: "11111111111111", mesReferencia: "2026-11", settlementId: "settlement", actorUserId: "actor" };
async function main() {
  let calls = 0;
  const client = (data: unknown, error: unknown = null) => ({ rpc: async (name: string, args: unknown) => {
    calls += 1;
    assert.equal(name, "hb_credit_liquidate_discount_pool");
    assert.deepEqual(args, { p_cooperative_cnpj: input.cnpj, p_mes_referencia: input.mesReferencia,
      p_settlement_id: input.settlementId, p_actor_user_id: input.actorUserId });
    return { data, error };
  } }) as unknown as SupabaseClient;
  assert.equal((await liquidateConfirmedSettlementDiscounts(client({ ok: true }), input)).ok, true);
  assert.equal((await liquidateConfirmedSettlementDiscounts(client({ ok: true, duplicate: true }), input)).ok, true);
  for (const data of [null, {}, { ok: "true" }, { ok: false, error: "Liquidação ainda não confirmada." }]) {
    assert.equal((await liquidateConfirmedSettlementDiscounts(client(data), input)).ok, false);
  }
  assert.equal((await liquidateConfirmedSettlementDiscounts(client(null, { message: "offline" }), input)).ok, false);
  const offline = { rpc: async () => { throw new Error("offline"); } } as unknown as SupabaseClient;
  assert.equal((await liquidateConfirmedSettlementDiscounts(offline, input)).ok, false);
  const before = calls;
  for (const patch of [{ cnpj: "" }, { mesReferencia: "2026-13" }, { settlementId: "" }, { actorUserId: "" }]) {
    assert.equal((await liquidateConfirmedSettlementDiscounts(client({ ok: true }), { ...input, ...patch })).ok, false);
  }
  assert.equal(calls, before, "Dados incompletos não podem disparar a liquidação");
  console.log("PASS: confirmação do servidor obrigatória, escopo preservado, repetição aceita e erro nunca tratado como sucesso.");
}
void main();
