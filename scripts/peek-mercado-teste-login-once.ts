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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: partners, error: e1 } = await sb
    .from("hb_credit_partners")
    .select("id,name,app_user_id,cooperative_cnpj,partner_cnpj,status")
    .ilike("name", "%mercado teste%");

  console.log("=== hb_credit_partners (nome ~ Mercado teste) ===");
  if (e1) console.error(e1.message);
  else console.log(JSON.stringify(partners, null, 2));

  const userIds = (partners ?? []).map((p) => p.app_user_id).filter(Boolean) as string[];
  if (userIds.length === 0) return;

  const { data: users, error: e2 } = await sb
    .from("app_users")
    .select("id,email,role,name,active")
    .in("id", userIds);

  console.log("\n=== app_users (login) ===");
  if (e2) console.error(e2.message);
  else console.log(JSON.stringify(users, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
