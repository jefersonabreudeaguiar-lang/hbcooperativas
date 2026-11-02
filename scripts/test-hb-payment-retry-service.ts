import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { authorizePayment } from "../src/lib/supabase/contaCoopStorage";
import { hashPassword } from "../src/lib/security/password";

async function main() {
  const pinHash = await hashPassword("1234");
  let rpcCalls = 0;
  let locked = false;
  let rejected = false;
  let receiptMissing = false;
  let receiptInRpc = false;
  const account = { id: "fixture-account", cooperado_id: "member", status: "active",
    pin_hash: pinHash, pin_failed_attempts: 0, limit_released_cents: 1000,
    amount_used_cents: 1000, own_balance_cents: 0 };
  const client = createClient("https://retry-fixture.supabase.co", "fixture-not-a-secret", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://retry-fixture.supabase.co");
      const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
        status, headers: { "content-type": "application/json" },
      });
      if (url.pathname.startsWith("/storage/")) return reply({ message: "fixture absent" }, 404);
      if (url.pathname.endsWith("/hb_credit_accounts")) {
        if (init?.method === "PATCH") return new Response(null, { status: 204 });
        return reply([{ ...account, pin_locked_until: locked ? "2099-01-01T00:00:00Z" : null }]);
      }
      if (url.pathname.endsWith("/hb_credit_audit_log")) return new Response(null, { status: 201 });
      if (url.pathname.endsWith("/hb_credit_transactions")) {
        assert.equal(url.searchParams.get("cooperative_cnpj"), "eq.99999999999999");
        assert.equal(url.searchParams.get("cooperado_id"), "eq.member");
        return reply(receiptMissing ? [] : [{ receipt_code: "ORIGINAL" }]);
      }
      if (url.pathname.endsWith("/rpc/hb_credit_authorize_payment")) {
        rpcCalls += 1;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.p_cooperado_id, "member");
        assert.equal(body.p_cooperative_cnpj, "99999999999999");
        assert.equal(body.p_cashback_applied_cents, Number.MAX_SAFE_INTEGER);
        return reply(rejected ? { ok: false, error: "Identificação de outra operação." } : {
          ok: true, duplicate: true, transacao_id: "original-tx", disponivel_apos_centavos: 0,
          ...(receiptInRpc ? { receipt_code: "SERVER-ORIGINAL" } : {}),
          credit_debited_cents: 900, own_balance_available_cents: 50,
        });
      }
      // Uma compra já confirmada não deve passar por prévia que exige QR pendente
      // ou saldo para pagar de novo; a RPC devolve o resultado original.
      throw new Error(`Acesso inesperado: ${url.pathname}`);
    } },
  });
  const input = { cooperativaCnpj: "99999999999999", cooperadoId: "member",
    intentId: "paid-intent", nonce: "nonce", idempotencyKey: "original-key",
    actorUserId: "actor", pin: "1234", useCashback: true };
  const result = await authorizePayment(client, input);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.duplicate, true);
    assert.equal(result.transacaoId, "original-tx");
    assert.equal(result.receiptCode, "ORIGINAL");
    assert.equal(result.creditoDebitadoCents, 900);
    assert.equal(result.saldoProprioAposCents, 50);
  }
  assert.equal(rpcCalls, 1);
  assert.equal((await authorizePayment(client, { ...input, pin: "9999" })).ok, false);
  assert.equal(rpcCalls, 1, "PIN errado não pode recuperar nem autorizar compra");
  locked = true;
  assert.equal((await authorizePayment(client, input)).ok, false);
  assert.equal(rpcCalls, 1, "Bloqueio de PIN continua obrigatório");
  locked = false;
  rejected = true;
  assert.equal((await authorizePayment(client, input)).ok, false);
  assert.equal(rpcCalls, 2);
  rejected = false;
  receiptMissing = true;
  assert.equal((await authorizePayment(client, input)).ok, false, "Não pode inventar comprovante quando a consulta falha");
  receiptInRpc = true;
  const serverReceipt = await authorizePayment(client, input);
  assert.equal(serverReceipt.ok, true);
  if (serverReceipt.ok) {
    assert.equal(serverReceipt.receiptCode, "SERVER-ORIGINAL");
    assert.equal(serverReceipt.disponivelAposCents, 0, "Saldo zero é uma resposta válida, sem recalcular dívida");
  }
  console.log("PASS: recuperação de comprovante com PIN válido, sem cobrar de novo; PIN errado/bloqueado e rejeição do banco não viram sucesso.");
}
void main();
