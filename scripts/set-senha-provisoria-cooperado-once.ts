/**
 * Define senha provisória em app_users (cooperado).
 * Uso: npx tsx scripts/set-senha-provisoria-cooperado-once.ts "jose bispo" [senha]
 * APPLY=1 obrigatório para gravar.
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";
import {
  findAppUserByEmail,
  logSecurityEvent,
  updateAppUserPasswordHash,
  upsertAppUserWithRoleRepair,
} from "../src/lib/supabase/usersAuth.ts";
import { normalizeCnpj } from "../src/utils/cooperativa.ts";

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

const NAME_QUERY = (process.argv[2] ?? "jose bispo").trim().toLowerCase();
const CUSTOM_PASS = process.argv[3]?.trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const CNPJ = normalizeCnpj("62351750000165");

function defaultTempPassword(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z]/g, "");
  const base = (slug || "Coop").slice(0, 12);
  return `${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()}2026hb!`;
}

function matchesName(full: string): boolean {
  const n = full.toLowerCase();
  const parts = NAME_QUERY.split(/\s+/).filter(Boolean);
  return parts.every((p) => n.includes(p));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: coopRow } = await sb.from("cooperativas").select("id").eq("cnpj", CNPJ).maybeSingle();
  if (!coopRow?.id) throw new Error(`Cooperativa não encontrada: ${CNPJ}`);

  const cooperados = await fetchCooperadosFromStorage(sb, CNPJ);
  const hits = cooperados.filter((c) => matchesName(c.nomeCompleto ?? ""));
  if (hits.length === 0) throw new Error(`Cooperado não encontrado: "${NAME_QUERY}"`);
  if (hits.length > 1) {
    console.error("Vários cooperados — refine o nome:");
    for (const c of hits) console.error(" -", c.nomeCompleto, c.id);
    process.exit(1);
  }

  const coop = hits[0];
  const tempPassword = CUSTOM_PASS && CUSTOM_PASS.length >= 6 ? CUSTOM_PASS : defaultTempPassword(coop.nomeCompleto);

  const { data: usersByCoop } = await sb
    .from("app_users")
    .select("id,email,name,role,cooperado_id,active")
    .eq("cooperado_id", coop.id);

  let user = usersByCoop?.[0] ?? null;
  if (!user && coop.email?.trim()) {
    user = await findAppUserByEmail(sb, coop.email);
  }

  console.log(`Cooperado: ${coop.nomeCompleto} (${coop.id})`);
  console.log(`APPLY=${APPLY}`);

  if (!user) {
    const email = coop.email?.trim().toLowerCase();
    if (!email) {
      throw new Error("Sem app_users e sem e-mail no cadastro do cooperado — cadastre e-mail primeiro.");
    }
    if (!APPLY) {
      console.log("\nDry-run: criaria app_users + senha provisória.");
      console.log("E-mail:", email);
      console.log("Senha provisória:", tempPassword);
      return;
    }
    const created = await upsertAppUserWithRoleRepair(sb, {
      id: `u_${coop.id.replace(/^c_/, "")}_coop`.slice(0, 64),
      email,
      password: tempPassword,
      name: coop.nomeCompleto.trim(),
      role: "cooperado",
      cooperativaId: coopRow.id as string,
      cooperadoId: coop.id,
      cooperativaCnpj: CNPJ,
      active: true,
    });
    if (!created) throw new Error("Falha ao criar app_users");
    await logSecurityEvent(sb, {
      action: "auth.password.provisional.admin_script",
      userId: created.id,
      userEmail: created.email,
      cooperativaCnpj: CNPJ,
      metadata: { cooperadoId: coop.id, created: true },
    });
    console.log("\nConta criada.");
    console.log("E-mail:", created.email);
    console.log("Senha provisória:", tempPassword);
    return;
  }

  if (!APPLY) {
    console.log("\nDry-run — defina APPLY=1 para gravar.");
    console.log("Usuário:", user.email, user.id);
    console.log("Senha provisória:", tempPassword);
    return;
  }

  await updateAppUserPasswordHash(sb, user.id, tempPassword);
  if (user.active === false) {
    await sb.from("app_users").update({ active: true }).eq("id", user.id);
  }
  await logSecurityEvent(sb, {
    action: "auth.password.provisional.admin_script",
    userId: user.id,
    userEmail: user.email,
    cooperativaCnpj: CNPJ,
    metadata: { cooperadoId: coop.id },
  });

  console.log("\nSenha provisória definida.");
  console.log("E-mail:", user.email);
  console.log("Senha provisória:", tempPassword);
  console.log("\nPeça para trocar em Mais → alterar senha após o primeiro login.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
