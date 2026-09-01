/**
 * Aplica constraint app_users com papel contador.
 * Uso: npx tsx scripts/apply-contador-role.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/APPLY_APP_USERS_CONTADOR_ROLE.sql"),
  "utf8"
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dbPassword = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_PASSWORD ?? "";
if (!supabaseUrl || !dbPassword) {
  console.error("DATABASE_URL ou SUPABASE_DB_PASSWORD ausente em .env.local");
  process.exit(1);
}

const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
const enc = encodeURIComponent(dbPassword);
const candidates = [
  `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${projectRef}:${enc}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
];

let ok = false;
for (const conn of candidates) {
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("OK — constraint app_users_role_check atualizada com contador");
    ok = true;
    break;
  } catch (e) {
    console.error("Falha:", conn.slice(0, 40) + "...", e instanceof Error ? e.message : e);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

if (!ok) process.exit(1);
