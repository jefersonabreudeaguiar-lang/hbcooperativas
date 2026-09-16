/**
 * Diagnóstico amount_used_cents vs transações posted (Jeferson).
 * node scripts/diag-jeferson-amount-used.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

const CNPJ = "62351750000165";
const J = "c_1781981564381_w67gg";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

function debitForPayment(t) {
  if (t.credit_debited_cents != null) return Number(t.credit_debited_cents);
  return Number(t.amount_cents);
}

const { data: acc } = await sb
  .from("hb_credit_accounts")
  .select("*")
  .eq("cooperative_cnpj", CNPJ)
  .eq("cooperado_id", J)
  .maybeSingle();

console.log("Conta:", {
  amount_used_cents: acc?.amount_used_cents,
  limit: acc?.limit_released_cents,
  available: acc?.available_cents,
  updated_at: acc?.updated_at,
});

const { data: txs } = await sb
  .from("hb_credit_transactions")
  .select(
    "id,event_type,status,amount_cents,credit_debited_cents,cashback_applied_cents,created_at,payment_intent_id"
  )
  .eq("cooperative_cnpj", CNPJ)
  .eq("cooperado_id", J)
  .order("created_at");

let expectedUsed = 0;
console.log("\nTransações:");
for (const t of txs ?? []) {
  if (t.event_type === "PAYMENT" && t.status === "posted") {
    expectedUsed += debitForPayment(t);
  }
  console.log(
    [
      t.created_at?.slice(0, 19),
      t.event_type,
      t.status,
      `amt=${t.amount_cents}`,
      `debit=${t.credit_debited_cents ?? "—"}`,
      t.id,
    ].join(" | ")
  );
}

const { data: refunds } = await sb
  .from("hb_credit_refunds")
  .select("original_transaction_id, refund_transaction_id, amount_cents, status")
  .eq("cooperative_cnpj", CNPJ);

const jefRefunds = (refunds ?? []).filter((r) =>
  (txs ?? []).some((t) => t.id === r.original_transaction_id)
);
console.log("\nRefunds ligados:", jefRefunds);

const stored = Number(acc?.amount_used_cents ?? 0);
console.log("\nEsperado (soma PAYMENT posted credit_debit):", expectedUsed);
console.log("Gravado amount_used_cents:", stored);
console.log("Divergência (stored - expected):", stored - expectedUsed);
