import { computeAmountUsedCentsFromPayments } from "../src/lib/supabase/creditAmountUsedReconcile.ts";

function ok(label: string, cond: boolean) {
  if (!cond) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("OK:", label);
}

ok(
  "só PAYMENT posted conta",
  computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "posted", amount_cents: 1000, credit_debited_cents: 1111 },
    { event_type: "PAYMENT", status: "reversed", amount_cents: 999, credit_debited_cents: 999 },
    { event_type: "REFUND", status: "posted", amount_cents: 999 },
  ]) === 1111
);

ok(
  "estornados não entram",
  computeAmountUsedCentsFromPayments([
    { event_type: "PAYMENT", status: "reversed", amount_cents: 1111, credit_debited_cents: 1111 },
  ]) === 0
);

ok(
  "fallback amount_cents",
  computeAmountUsedCentsFromPayments([{ event_type: "PAYMENT", status: "posted", amount_cents: 500 }]) === 500
);

console.log("\nTodos os testes passaram.");
