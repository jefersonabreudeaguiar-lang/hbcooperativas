import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHbOwnedBalanceOperationsReady } from "../src/config/hbOwnedBalanceRollout";
import { buildFichaQuitadaWindowsForTitularIds, computeAmountUsedCentsFromPayments } from "../src/lib/hb-credit/creditAmountUsedFichaQuitada";
import type { OperacionalSyncPayload } from "../src/lib/supabase/cooperativaSyncStorage";
import { signedLedgerAmountCentsForExtrato } from "../src/lib/hb-credit/ledgerLabels";
import { authorizeCooperadoTransferPayment, createCooperadoTransferIntent } from "../src/lib/supabase/cooperadoTransferenciaCreditoStorage";
import { sweepUnusedCashbackToCredit } from "../src/lib/supabase/contaCoopStorage";
import { canAffordHbPaymentWithLimite, hbCreditDebitFromGrossCents, hbPaymentAvailableCents } from "../src/modules/hb-credit/engine/paymentAffordability";
import type { ContaCoopLimiteCooperado } from "../src/modules/hb-credit/types";
import { hbCreditAccountPersistidoEhShellVazio, type HbCreditAccountPersistido } from "../src/lib/hb-credit/hbCreditAccountPersistencia";

async function main() {
  const funds = { valorDisponivelCents: 500, saldoProprioDisponivelCents: 300,
    cashbackDisponivelCents: 200 } as ContaCoopLimiteCooperado;
  assert.equal(hbPaymentAvailableCents(funds), 800);
  assert.equal(canAffordHbPaymentWithLimite(funds, 1000, false), false);
  assert.equal(canAffordHbPaymentWithLimite(funds, 1000, true), true);
  assert.equal(hbCreditDebitFromGrossCents(1000, true, 200, 300), 500);
  assert.equal(hbCreditDebitFromGrossCents(1000, false, 200, 2000), 0);
  assert.equal(hbCreditDebitFromGrossCents(1000, true, 2000, 300), 0);
  assert.equal(signedLedgerAmountCentsForExtrato("OWN_BALANCE_USE", "debit", 300), -300);
  assert.equal(signedLedgerAmountCentsForExtrato("OWN_BALANCE_REFUND", "credit", 300), 300);
  assert.equal(hbCreditAccountPersistidoEhShellVazio({ account: {
    limiteLiberadoCents: 0, valorDisponivelCents: 0, valorUsadoCents: 0,
    saldoProprioDisponivelCents: 300,
  }, hasPin: false } as HbCreditAccountPersistido), false, "Saldo próprio não pode ser descartado como conta vazia");
  const rows = [
    { id: "payment", event_type: "PAYMENT", status: "posted", amount_cents: 100, credit_debited_cents: 100 },
    { id: "ctrf_out", event_type: "ADJUSTMENT", status: "posted", amount_cents: 300, credit_debited_cents: 200 },
    { id: "ctrf_out:received", event_type: "ADJUSTMENT", status: "posted", amount_cents: 300, credit_debited_cents: 0 },
    { id: "cbrec", event_type: "ADJUSTMENT", status: "posted", amount_cents: 800 },
    { id: "cbsweep", event_type: "ADJUSTMENT", status: "posted", amount_cents: 900 },
  ];
  assert.equal(computeAmountUsedCentsFromPayments(rows), 300, "Somente crédito efetivamente usado vira dívida");
  assert.equal(computeAmountUsedCentsFromPayments(rows, { explicitTransactionIds: new Set(["ctrf_out"]), windows: [] }), 100);
  const startMs = Date.parse("2026-11-01T00:00:00Z");
  const endMs = Date.parse("2026-12-01T00:00:00Z");
  const quitadoAteMs = Date.parse("2026-11-10T12:00:00Z");
  const history = { pagamentosCooperado: [{ cooperadoId: "member", status: "confirmado",
    mesReferencia: "2026-11", descontosExtras: [], pagoEm: "2026-11-10T12:00:00Z",
    createdAt: "2026-11-10T12:00:00Z", assinadoEm: "2026-11-20T12:00:00Z", updatedAt: "2026-11-21T12:00:00Z" }],
    arquivosMensais: [] } as unknown as OperacionalSyncPayload;
  assert.equal(buildFichaQuitadaWindowsForTitularIds(history, ["member"]).windows[0].quitadoAteMs, quitadoAteMs,
    "Assinatura ou edição tardia não quita operações posteriores ao pagamento");
  const before = { ...rows[1], created_at: "2026-11-09T12:00:00Z" };
  const after = { ...rows[0], created_at: "2026-11-11T12:00:00Z" };
  assert.equal(computeAmountUsedCentsFromPayments([before, after], {
    explicitTransactionIds: new Set(), windows: [{ mesReferencia: "2026-11", startMs, endMs, quitadoAteMs }],
  }), 100, "Operação posterior ao pagamento continua em uso");
  assert.equal(signedLedgerAmountCentsForExtrato("TRANSFER_OUT", "debit", 300), -300);
  assert.equal(signedLedgerAmountCentsForExtrato("TRANSFER_IN", "credit", 300), 300);
  assert.equal(isHbOwnedBalanceOperationsReady(), false);
  const noCalls = new Proxy({}, { get() { throw new Error("Operação não liberada acessou o banco"); } }) as SupabaseClient;
  await assert.rejects(createCooperadoTransferIntent(noCalls, {
    cooperativeCnpj: "11111111111111", receiverCooperadoId: "receiver", receiverNome: "Fixture", amountCents: 100,
  }), /validação/);
  const transfer = await authorizeCooperadoTransferPayment(noCalls, {
    cooperativeCnpj: "11111111111111", intentId: "ctrf_fixture", nonce: "fixture", payerCooperadoId: "payer",
    idempotencyKey: "fixture", pin: "0000", actorUserId: "actor",
  });
  assert.equal(transfer.ok, false);
  assert.equal((await sweepUnusedCashbackToCredit(noCalls, "11111111111111", "2026-11", "actor")).ok, false);
  console.log("PASS: saldo próprio não vira dívida, crédito transferido é reconciliado, operações posteriores ao pagamento permanecem abertas e funções incompletas não são liberadas.");
}
void main();
