/**
 * Passo 3.5 — somente leitura (não commitar). Prova capacidade do ambiente HB E2E.
 * npx tsx scripts/_once-hb-35-env-probe.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string): Record<string, string> {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return {};
  const o: Record<string, string> = {};
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    o[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return o;
}

async function probe(label: string, url: string, key: string) {
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const cnpj = "62351750000165";
  console.log(`\n=== ${label} (${url.replace("https://", "").split(".")[0]}) ===`);

  for (const [name, builder] of [
    ["cooperativas_cnpj", () => sb.from("cooperativas").select("id", { count: "exact", head: true }).eq("cnpj", cnpj)],
    ["app_users_cooperado", () => sb.from("app_users").select("id", { count: "exact", head: true }).eq("role", "cooperado")],
    ["app_users_parceiro", () => sb.from("app_users").select("id", { count: "exact", head: true }).eq("role", "parceiro")],
    ["hb_credit_accounts", () => sb.from("hb_credit_accounts").select("id", { count: "exact", head: true }).eq("cooperative_cnpj", cnpj)],
    ["hb_credit_partners", () => sb.from("hb_credit_partners").select("id", { count: "exact", head: true }).eq("cooperative_cnpj", cnpj)],
    [
      "hb_credit_transactions_posted",
      () =>
        sb
          .from("hb_credit_transactions")
          .select("id", { count: "exact", head: true })
          .eq("cooperative_cnpj", cnpj)
          .eq("status", "posted"),
    ],
  ] as const) {
    const { count, error } = await builder();
    console.log(`${name}:`, error ? `ERR ${error.message}` : count);
  }

  const { error: rpcErr } = await sb.rpc("hb_credit_refund_payment", {
    p_transaction_id: "probe_invalid",
    p_cooperative_cnpj: cnpj,
    p_refund_transaction_id: "probe_r",
    p_refund_id: "probe_f",
    p_actor_user_id: "probe",
  });
  console.log(
    "rpc_hb_credit_refund_payment:",
    rpcErr?.message?.includes("does not exist") ? "MISSING" : rpcErr ? "PRESENT (probe err expected)" : "OK?"
  );

  const { data: partners } = await sb
    .from("hb_credit_partners")
    .select("id,name,status")
    .eq("cooperative_cnpj", cnpj)
    .eq("status", "ACTIVE")
    .limit(5);
  console.log("partners_ativos:", (partners ?? []).map((p) => p.name).join(" | ") || "(nenhum)");

  const { data: acc } = await sb
    .from("hb_credit_accounts")
    .select("id,cooperado_id,limit_released_cents,amount_used_cents")
    .eq("cooperative_cnpj", cnpj)
    .gt("limit_released_cents", 0)
    .order("amount_used_cents", { ascending: false })
    .limit(5);
  for (const a of acc ?? []) {
    const disp = Number(a.limit_released_cents) - Number(a.amount_used_cents);
    console.log(
      `conta ${a.cooperado_id} limite=${a.limit_released_cents} usado=${a.amount_used_cents} disp=${disp} account_id=${a.id}`
    );
  }

  const { data: lastTx } = await sb
    .from("hb_credit_transactions")
    .select("id,cooperado_id,event_type,amount_cents,credit_debited_cents,created_at,idempotency_key")
    .eq("cooperative_cnpj", cnpj)
    .eq("status", "posted")
    .order("created_at", { ascending: false })
    .limit(1);
  console.log("ultima_tx:", lastTx?.[0] ? JSON.stringify(lastTx[0]) : "(nenhuma)");
}

async function main() {
  const homolog = loadEnv(".env.homolog.local");
  const prod = loadEnv(".env.local");
  if (homolog.NEXT_PUBLIC_SUPABASE_URL && homolog.SUPABASE_SERVICE_ROLE_KEY) {
    await probe("HOMOLOG", homolog.NEXT_PUBLIC_SUPABASE_URL, homolog.SUPABASE_SERVICE_ROLE_KEY);
    console.log("HB_CREDIT flags homolog:", {
      HB_CREDIT_ENABLED: homolog.HB_CREDIT_ENABLED,
      HB_CREDIT_OPERATIONS_ENABLED: homolog.HB_CREDIT_OPERATIONS_ENABLED,
    });
  } else console.log("Homolog env incompleto");

  if (prod.NEXT_PUBLIC_SUPABASE_URL && prod.SUPABASE_SERVICE_ROLE_KEY) {
    await probe("PROD (espelho .env.local)", prod.NEXT_PUBLIC_SUPABASE_URL, prod.SUPABASE_SERVICE_ROLE_KEY);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
