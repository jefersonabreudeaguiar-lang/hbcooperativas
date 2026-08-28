import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("missing supabase env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function check(table: string) {
  const { error } = await sb.from(table).select("*").limit(1);
  return error ? error.message : "ok";
}

async function checkRpc(name: string) {
  const { error } = await sb.rpc(name, {});
  if (!error) return "ok";
  if (/does not exist/i.test(error.message)) return "missing";
  return error.message;
}

(async () => {
  console.log("hb_credit_accounts:", await check("hb_credit_accounts"));
  console.log("cooperativas:", await check("cooperativas"));
  console.log("hb_credit_authorize_payment:", await checkRpc("hb_credit_authorize_payment"));
})();
