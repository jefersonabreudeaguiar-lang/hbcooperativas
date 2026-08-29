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

async function check(table: string, column: string) {
  const endpoint = `${url}/rest/v1/${table}?select=${column}&limit=1`;
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();
  if (res.ok) {
    console.log(`${table}.${column}: OK`);
    return true;
  }
  console.log(`${table}.${column}: MISSING (${body.slice(0, 120)})`);
  return false;
}

async function main() {
  const results = await Promise.all([
    check("hb_credit_partners", "pix_key"),
    check("hb_credit_settlements", "id"),
    check("hb_credit_receivables", "settlement_id"),
  ]);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
