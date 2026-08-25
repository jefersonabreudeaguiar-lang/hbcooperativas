/**
 * Testes do HB Credit Lab — execução local com flag ativa.
 * Uso: npm run test:hb-credit-lab
 */
import assert from "node:assert/strict";

process.env.HB_CREDIT_LAB_ENABLED = "true";

async function main() {
  const {
    resetLabStoreForTests,
    createLabPaymentIntent,
    authorizeLabPayment,
    buildLabQrPayload,
    parseLabQrPayload,
    getLabAccount,
  } = await import("../src/modules/hb-credit-lab/server/labStore");

  resetLabStoreForTests();

  const accountBefore = getLabAccount();
  assert.equal(accountBefore.saldoDisponivelCents, 48500);

  const intent = createLabPaymentIntent({
    marketId: "LAB_ONLY_market_a",
    amountReais: 10.5,
    descricao: "Teste lab",
  });

  const qr = buildLabQrPayload(intent);
  const parsed = parseLabQrPayload(qr);
  assert.ok(parsed);
  assert.equal(parsed!.intentId, intent.id);

  const result = authorizeLabPayment({
    intentId: intent.id,
    nonce: intent.nonce,
    idempotencyKey: "test_idem_1",
  });

  assert.equal(result.transaction.status, "completed");
  assert.equal(getLabAccount().saldoDisponivelCents, 48500 - 1050);

  const again = authorizeLabPayment({
    intentId: intent.id,
    nonce: intent.nonce,
    idempotencyKey: "test_idem_1",
  });
  assert.equal(again.transaction.id, result.transaction.id);

  console.log("✓ test-hb-credit-lab passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
