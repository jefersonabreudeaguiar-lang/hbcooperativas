/**
 * Aplica migrations HB Credit (foundation + operational) no Supabase.
 * Idempotente — usa IF NOT EXISTS / CREATE OR REPLACE onde possível.
 *
 * Requer em .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_DB_PASSWORD  (senha do postgres — Project Settings → Database)
 *
 * Uso: npx tsx scripts/apply-hb-credit-migrations.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? process.env.DATABASE_URL ?? "";

if (!supabaseUrl) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL em .env.local");
  process.exit(1);
}

const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];

function buildConnectionString(): string {
  if (dbPassword.startsWith("postgresql://") || dbPassword.startsWith("postgres://")) {
    return dbPassword;
  }
  if (!dbPassword) {
    throw new Error(
      "Configure SUPABASE_DB_PASSWORD (senha do banco) ou DATABASE_URL completa em .env.local"
    );
  }
  const host = `db.${projectRef}.supabase.co`;
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@${host}:5432/postgres`;
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [table]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

async function rpcExists(client: pg.Client, name: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1 limit 1`,
    [name]
  );
  return res.rowCount !== null && res.rowCount > 0;
}

async function runMigrationFile(client: pg.Client, relativePath: string) {
  const fullPath = resolve(process.cwd(), relativePath);
  const sql = readFileSync(fullPath, "utf8");
  console.log(`  executando ${relativePath}...`);
  await client.query(sql);
  console.log(`  ok ${relativePath}`);
}

async function verifyExistingApp(client: pg.Client) {
  const mustExist = ["cooperativas"];
  for (const table of mustExist) {
    const ok = await tableExists(client, table);
    if (!ok) {
      throw new Error(`Tabela crítica ausente: ${table}. Abortando para preservar o app.`);
    }
  }
  console.log("  tabela cooperativas: ok");

  for (const table of ["app_users", "notas_pedido"]) {
    const ok = await tableExists(client, table);
    console.log(`  tabela ${table}: ${ok ? "ok" : "ausente (app segue com fluxo atual)"}`);
  }
}

async function ensurePrerequisites(client: pg.Client) {
  if (!(await tableExists(client, "app_users"))) {
    console.log("\n[0/2] app_users (pré-requisito auth nuvem)");
    await runMigrationFile(client, "supabase/migrations/20260620120000_app_users_security.sql");
  }
}

async function main() {
  const conn = buildConnectionString();
  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

  console.log("HB Credit — aplicar migrations\n");
  await client.connect();

  try {
    await verifyExistingApp(client);

    const foundationApplied = await tableExists(client, "hb_credit_accounts");
    const rpcApplied = await rpcExists(client, "hb_credit_authorize_payment");

    if (foundationApplied && rpcApplied) {
      console.log("\nMigrations HB Credit já aplicadas. Nada a fazer.");
      return;
    }

    await ensurePrerequisites(client);

    if (!foundationApplied) {
      console.log("\n[1/2] foundation");
      await runMigrationFile(client, "supabase/migrations/20260828120000_hb_credit_foundation.sql");
    } else {
      console.log("\n[1/2] foundation — já presente");
    }

    if (!rpcApplied) {
      console.log("\n[2/2] operational");
      await runMigrationFile(client, "supabase/migrations/20260828140000_hb_credit_operational.sql");
    } else {
      console.log("\n[2/2] operational — já presente");
    }

    const okFoundation = await tableExists(client, "hb_credit_accounts");
    const okRpc = await rpcExists(client, "hb_credit_authorize_payment");
    if (!okFoundation || !okRpc) {
      throw new Error("Verificação pós-migration falhou.");
    }

    console.log("\nConcluído: hb_credit_accounts + hb_credit_authorize_payment OK.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nErro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
