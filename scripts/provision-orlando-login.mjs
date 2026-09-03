/**
 * Cria conta cooperado para Orlando Fetisch (sem app_users).
 * Uso: node scripts/provision-orlando-login.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const ORLANDO = {
  id: "u_orlando_fetisch_coop",
  email: "coopeagri2024@gmail.com",
  name: "Orlando Fetisch",
  cooperadoId: "c_1782263929381_ncp55",
  cooperativaId: "06342dae-8191-4193-94b6-d0be3a82e10b",
  cooperativaCnpj: "62351750000165",
  tempPassword: "Orlando2026hb",
};

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  realtime: { transport: ws },
});

const existing = await sb.from("app_users").select("id,email,role,cooperado_id").eq("email", ORLANDO.email).maybeSingle();
if (existing.data) {
  if (existing.data.cooperado_id === ORLANDO.cooperadoId && existing.data.role === "cooperado") {
    console.log("Conta cooperado Orlando já existe:", existing.data);
    process.exit(0);
  }
  console.error("E-mail já usado por outra conta:", existing.data);
  process.exit(1);
}

const password_hash = await bcrypt.hash(ORLANDO.tempPassword, 12);
const { data, error } = await sb
  .from("app_users")
  .upsert(
    {
      id: ORLANDO.id,
      email: ORLANDO.email,
      password_hash,
      name: ORLANDO.name,
      role: "cooperado",
      cooperativa_id: ORLANDO.cooperativaId,
      cooperado_id: ORLANDO.cooperadoId,
      cooperativa_cnpj: ORLANDO.cooperativaCnpj,
      active: true,
    },
    { onConflict: "id" }
  )
  .select()
  .single();

if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}

await sb.from("security_audit_log").insert({
  action: "auth.provision.admin_script",
  user_id: ORLANDO.id,
  user_email: ORLANDO.email,
  cooperativa_cnpj: ORLANDO.cooperativaCnpj,
  metadata: { cooperadoId: ORLANDO.cooperadoId, reason: "orlando_sem_app_users_votacao" },
});

console.log("Conta cooperado criada:");
console.log("- Nome:", ORLANDO.name);
console.log("- E-mail:", ORLANDO.email);
console.log("- Senha temporária:", ORLANDO.tempPassword);
console.log("- Cooperado ID:", ORLANDO.cooperadoId);
