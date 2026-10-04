/**
 * npx tsx scripts/test-hb-payment-affordability.ts
 */
import {
  canAffordHbPaymentScanPreview,
  canAffordHbPaymentWithLimite,
  hbCreditDebitFromGrossCents,
} from "../src/modules/hb-credit/engine/paymentAffordability";
import type { ContaCoopLimiteCooperado } from "../src/modules/hb-credit/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const base: ContaCoopLimiteCooperado = {
  cooperadoId: "c1",
  limiteLiberadoCents: 10_000,
  valorUsadoCents: 0,
  valorDisponivelCents: 10_000,
  cashbackDisponivelCents: 3_000,
  bloqueado: false,
};

assert(hbCreditDebitFromGrossCents(5_000, false, 3_000) === 5_000, "sem cashback debita gross");
assert(hbCreditDebitFromGrossCents(5_000, true, 3_000) === 2_000, "cashback reduz debito");
assert(!canAffordHbPaymentWithLimite(base, 12_000, false), "acima do saldo HB");
assert(!canAffordHbPaymentScanPreview(base, 12_000), "scan nao usa cashback para cobrir");
assert(canAffordHbPaymentScanPreview(base, 8_000), "scan aceita dentro do saldo");
assert(!canAffordHbPaymentScanPreview({ ...base, valorDisponivelCents: 1_000, cashbackDisponivelCents: 5_000 }, 2_000), "cashback nao aumenta saldo de pagamento");

console.log("test-hb-payment-affordability: OK");
