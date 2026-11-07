import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCooperadoTransferIntent, authorizeCooperadoTransferPayment } from "../src/lib/supabase/cooperadoTransferenciaCreditoStorage";
async function main() {
  process.env.NEXT_PUBLIC_COOPERADO_TRANSFERENCIA_CREDITO = "false";
  const noCalls = new Proxy({}, { get() { throw new Error("Transferência pausada acessou o banco"); } }) as SupabaseClient;
  await assert.rejects(createCooperadoTransferIntent(noCalls,{cooperativeCnpj:"88888888000181",receiverCooperadoId:"fixture",receiverNome:"Fixture",amountCents:100}),/temporariamente/);
  const result = await authorizeCooperadoTransferPayment(noCalls,{cooperativeCnpj:"88888888000181",intentId:"ctrf_fixture",nonce:"fixture",payerCooperadoId:"fixture",idempotencyKey:"fixture",pin:"0000",actorUserId:"fixture"});
  assert.equal(result.ok,false);
  if(!result.ok) assert.equal(result.code,"HB_TRANSFER_PAUSED");
  console.log("PASS 795: transferência pausada antes de PIN, RPC e alteração financeira.");
}
void main();
