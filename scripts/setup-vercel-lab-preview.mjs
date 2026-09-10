#!/usr/bin/env node
/**
 * Configura variáveis Preview do Hobelisco LAB no Vercel.
 * Requer: vercel login (ou VERCEL_TOKEN) + projeto linkado.
 *
 * Uso:
 *   node scripts/setup-vercel-lab-preview.mjs
 *   node scripts/setup-vercel-lab-preview.mjs --deploy
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = value;
  }
  return out;
}

function runVercel(args, input) {
  const res = spawnSync("npx", ["vercel", ...args], {
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    shell: true,
    input,
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`vercel ${args.join(" ")} failed (${res.status})`);
  }
}

const local = loadEnvFile(resolve(process.cwd(), ".env.local"));
const labExample = loadEnvFile(resolve(process.cwd(), ".env.hobelisco-lab.example"));

const supabaseUrl = local.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

const previewEnv = {
  ...labExample,
  HOBELISCO_ENVIRONMENT: "LAB",
  HB_HOBELISCO_LAB_DEPLOY: "true",
  HB_HOBELISCO_MIRROR_ENABLED: "true",
  HB_HOBELISCO_BOUNDARY_STRICT: "true",
  HB_HOBELISCO_PRODUCTION_SUPABASE_REF: supabaseRef,
  HB_HOBELISCO_LAB_SUPABASE_URL:
    local.HB_HOBELISCO_LAB_SUPABASE_URL ??
    local.HB_HOBELISCO_STAGING_SUPABASE_URL ??
    supabaseUrl,
  HB_HOBELISCO_LAB_SERVICE_ROLE_KEY:
    local.HB_HOBELISCO_LAB_SERVICE_ROLE_KEY ??
    local.HB_HOBELISCO_STAGING_SERVICE_ROLE_KEY ??
    local.SUPABASE_SERVICE_ROLE_KEY ??
    "",
  HB_HOBELISCO_STAGING_ENABLED: "true",
  HB_HOBELISCO_LAB_ENABLED: "true",
  NEXT_PUBLIC_HB_HOBELISCO_LAB_ENABLED: "true",
  HB_HOBELISCO_V2_ENABLED: "true",
  HB_HOBELISCO_OBSERVE_ONLY: "true",
  HB_HOBELISCO_PROBE_COOP_CNPJ: local.HB_HOBELISCO_PROBE_COOP_CNPJ ?? "",
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: local.SUPABASE_SERVICE_ROLE_KEY ?? "",
  NEXT_PUBLIC_APP_CREATOR_EMAILS: local.NEXT_PUBLIC_APP_CREATOR_EMAILS ?? "",
  AUTH_SECRET: local.AUTH_SECRET ?? "hb-cooperativas-prod-jwt-secret-2026-stable",
  HOBELISCO_ACTIVE_DEFENSE_ENABLED: "false",
  HB_ADAPTIVE_DEFENSE_ENABLED: "false",
  HOBELISCO_AUTO_REPAIR: "false",
  HOBELISCO_FABRIC_MODE: "SHADOW",
  HB_HOBELISCO_CREDIT_WATCH_ENABLED: "false",
  HB_HOBELISCO_WHATSAPP_ENABLED: "false",
};

const skip = new Set(["", undefined]);
const keys = Object.entries(previewEnv).filter(([, v]) => v && !skip.has(v));

console.log("=== Setup Vercel Preview — Hobelisco LAB ===\n");
console.log(`Variáveis a aplicar (Preview): ${keys.length}`);

try {
  runVercel(["link", "--yes", "--project", "hbcooperativas"]);
} catch {
  console.log("Link automático falhou — execute `npx vercel link` se necessário.");
}

for (const [key, value] of keys) {
  console.log(`→ ${key}`);
  try {
    runVercel(["env", "add", key, "preview", "--force"], `${value}\n`);
  } catch (e) {
    console.warn(`  aviso: ${key} — ${e.message}`);
  }
}

if (process.argv.includes("--deploy")) {
  console.log("\nDeploy Preview branch lab/hobelisco-mirror…");
  runVercel(["deploy", "--prebuilt=false"]);
}

console.log("\nAdmin LAB (após deploy):");
console.log("  https://hbcooperativas-git-lab-hobelisco-mirror-jefersonabreudeaguiar-lang.vercel.app/admin");
console.log("\nConfira o link exato em Vercel → Deployments → Visit");
