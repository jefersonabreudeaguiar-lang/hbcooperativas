#!/usr/bin/env npx tsx
/** Diagnóstico rápido: qual Supabase o LAB usa e se app_users responde. */
import { loadBicLabEnv } from "./loadBicLabEnv";
import { getSupabaseAdmin } from "../../src/lib/supabase/admin";

loadBicLabEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? "MISSING";
const prodRef = process.env.HB_BIC_PRODUCTION_SUPABASE_REF ?? "ifptyzikekrswippzmsf";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

console.log("APP_ENV", process.env.APP_ENV ?? "(unset)");
console.log("BIC_LAB", process.env.NEXT_PUBLIC_HB_BIC_LAB_ENABLED ?? "(unset)");
console.log("SUPABASE_REF", ref);
console.log("PRODUCTION_REF_BLOCKED", prodRef);
console.log("POINTS_TO_PRODUCTION", ref === prodRef ? "YES — ERRO" : "no");

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.bic-lab");
  process.exit(1);
}

const sb = getSupabaseAdmin();
if (!sb) {
  console.error("getSupabaseAdmin indisponível");
  process.exit(1);
}

void (async () => {
  const { count, error: countErr } = await sb
    .from("app_users")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    console.error("app_users:", countErr.message);
    process.exit(2);
  }

  console.log("app_users_count", count ?? 0);
  console.log("OK — use e-mail/senha cadastrados neste projeto homolog (não hbcooperativas produção).");
})();
