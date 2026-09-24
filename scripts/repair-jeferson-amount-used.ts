/**
 * Repara amount_used_cents desalinhado (ex.: Jeferson R$ 11,11 após estornos).
 * npx tsx scripts/repair-jeferson-amount-used.ts
 * npx tsx scripts/repair-jeferson-amount-used.ts --apply
 */
import { assertNotProductionTarget } from "./lib/assertNotProductionTarget.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import {
  computeAmountUsedCentsFromPayments,
  reconcileCooperadoAmountUsedCents,
} from "../src/lib/supabase/creditAmountUsedReconcile";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}

assertNotProductionTarget();
const APPLY = process.argv.includes("--apply");
const CNPJ = "62351750000165";
const J = "c_1781981564381_w67gg";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  realtime: { transport: ws },
});

async function main() {
  const { data: before } = await sb
    .from("hb_credit_accounts")
    .select("amount_used_cents, available_cents")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", J)
    .maybeSingle();

  console.log("Antes:", before);

  const { data: txs } = await sb
    .from("hb_credit_transactions")
    .select("event_type, status, amount_cents, credit_debited_cents")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", J)
    .eq("event_type", "PAYMENT");

  const expected = computeAmountUsedCentsFromPayments(txs ?? []);
  console.log("Esperado amount_used_cents:", expected, "| gravado:", before?.amount_used_cents);

  if (!APPLY) {
    console.log("\nDry-run — use --apply para corrigir na nuvem.");
    return;
  }

  const result = await reconcileCooperadoAmountUsedCents(sb, CNPJ, J, "script:repair-jeferson-amount-used");
  console.log("Reconcile:", result);

  const { data: after } = await sb
    .from("hb_credit_accounts")
    .select("amount_used_cents, available_cents")
    .eq("cooperative_cnpj", CNPJ)
    .eq("cooperado_id", J)
    .maybeSingle();
  console.log("Depois:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
