/**
 * Verifica se hb_hobelisco_v2_staging.sql foi aplicado no Supabase (.env.local)
 */
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

const EXPECTED_TABLES = [
  "hb_hobelisco_observations",
  "hb_hobelisco_incidents",
  "hb_hobelisco_memory",
  "hb_hobelisco_threat_fingerprints",
  "hb_hobelisco_antibodies",
  "hb_hobelisco_heartbeats",
  "hb_hobelisco_state",
  "hb_hobelisco_learning",
  "hb_hobelisco_audit",
];

async function countRows(table: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, count: 0, error: body.slice(0, 200) };
  }
  const range = res.headers.get("content-range") ?? "";
  const match = range.match(/\/(\d+)$/);
  const count = match ? Number(match[1]) : 0;
  return { ok: true, count };
}

async function main() {
  if (!url || !key) {
    console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
    process.exit(1);
  }

  console.log("=== Verificação HOBELISCO V2 Schema ===");
  console.log(`Supabase: ${url}\n`);

  let ok = 0;
  for (const table of EXPECTED_TABLES) {
    const r = await countRows(table);
    if (r.ok) {
      ok += 1;
      console.log(`[OK] ${table} — ${r.count} linha(s)`);
    } else {
      console.log(`[FAIL] ${table}`);
      console.log(`       ${r.error}`);
    }
  }

  console.log(`\nTabelas: ${ok}/${EXPECTED_TABLES.length}`);
  if (ok === EXPECTED_TABLES.length) {
    console.log("Veredito: SCHEMA_V2_OK — SQL aplicado corretamente (tabelas vazias é normal).");
  } else {
    console.log("Veredito: SCHEMA_V2_INCOMPLETO — revise o SQL aplicado ou o projeto Supabase.");
    process.exit(1);
  }

  console.log("\n--- Regressão: tabelas HB existentes ---");
  for (const table of ["cooperativas", "hb_credit_accounts", "hb_credit_transactions", "app_users"]) {
    const r = await countRows(table);
    console.log(r.ok ? `[OK] ${table} — intacta (${r.count} linhas)` : `[FAIL] ${table} — ${r.error}`);
  }
}

main();
