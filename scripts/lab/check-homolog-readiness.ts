#!/usr/bin/env npx tsx
/** Verifica homolog LAB: Supabase ref, app_users, schema HB, operacional.json. */
import { loadBicLabEnv } from "./loadBicLabEnv";
import { evaluateProductionGuard } from "../lib/assertNotProductionTarget.mjs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

loadBicLabEnv();

const guard = evaluateProductionGuard(process.env);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? "?";

console.log("=== LAB homolog readiness ===");
console.log("guard:", guard.allowed ? "ALLOWED" : guard.message);
console.log("supabase_ref:", ref);
console.log("bic_lab:", process.env.NEXT_PUBLIC_HB_BIC_LAB_ENABLED);
console.log("b4_lab:", process.env.HB_BIC_LAB_B4_AUTHORITY);
console.log("central_read:", process.env.NEXT_PUBLIC_BIC_CENTRAL_READ ?? "(unset)");

if (!guard.allowed) process.exit(1);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false }, realtime: { transport: ws } }
);

const cnpj = "62351750000165";

void (async () => {
  const tables = ["app_users", "hb_credit_accounts", "hb_credit_transactions", "hb_credit_cooperative_caps"];
  for (const t of tables) {
    const { error } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`table ${t}:`, error ? `MISSING (${error.message})` : "OK");
  }

  const { data: op, error: opErr } = await sb.storage.from("hb-cooperativa-sync").download(`${cnpj}/operacional.json`);
  console.log("operacional.json:", opErr ? `MISSING (${opErr.message})` : op ? "OK" : "MISSING");

  const { data: acc } = await sb
    .from("hb_credit_accounts")
    .select("limit_released_cents,amount_used_cents")
    .eq("cooperative_cnpj", cnpj)
    .eq("cooperado_id", "c_1781981564381_w67gg")
    .maybeSingle();

  if (acc) {
    console.log("jeferson_hb_account:", acc);
  } else {
    console.log("jeferson_hb_account: (sem linha — responsável precisa liberar limite)");
  }

  console.log("\nVeredito: rode lab:apply-hb-credit se tabelas HB MISSING; sync operacional + limites na UI.");
})();
