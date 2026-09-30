import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";

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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    realtime: { transport: ws },
  });
  const cs = await fetchCooperadosFromStorage(sb, "62351750000165");
  if (!process.argv[2]) {
    console.log("Cooperados (todos):");
    for (const c of cs.sort((a, b) => (a.nomeCompleto ?? "").localeCompare(b.nomeCompleto ?? "", "pt-BR"))) {
      console.log(" -", c.nomeCompleto);
    }
    return;
  }
  const q = process.argv[2].toLowerCase();
  for (const c of cs) {
    const n = (c.nomeCompleto ?? "").toLowerCase();
    if (n.includes(q)) console.log(c.nomeCompleto, "|", c.id, "|", c.email ?? "(sem email)");
  }
  const { data: users } = await sb.from("app_users").select("id,name,email,cooperado_id,role").ilike("name", `%${q}%`);
  if (users?.length) {
    console.log("\napp_users (name):");
    for (const u of users) console.log(u.name, "|", u.email, "|", u.role, "|", u.cooperado_id);
  }
  const { data: byEmail } = await sb.from("app_users").select("id,name,email,role,cooperativa_cnpj").ilike("email", `%${q}%`);
  if (byEmail?.length) {
    console.log("\napp_users (email):");
    for (const u of byEmail) console.log(u.name, "|", u.email, "|", u.role, "|", u.cooperativa_cnpj);
  }
  if (q.length >= 3) {
    const { data: global } = await sb
      .from("app_users")
      .select("id,name,email,role,cooperativa_cnpj")
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(20);
    if (global?.length) {
      console.log("\napp_users (global):");
      for (const u of global) console.log(u.name, "|", u.email, "|", u.role, "|", u.cooperativa_cnpj);
    }
  }
  console.log(`\nTotal cooperados storage: ${cs.length}`);
}
main();
