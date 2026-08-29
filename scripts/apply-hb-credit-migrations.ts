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
if (!dbPassword) {
  console.error("Configure SUPABASE_DB_PASSWORD ou DATABASE_URL completa em .env.local");
  process.exit(1);
}

const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];

function buildConnectionCandidates(password: string): string[] {
  const regions = ["us-east-1", "sa-east-1", "us-east-2", "us-west-1", "eu-west-1"];
  const list: string[] = [];
  if (password.startsWith("postgresql://") || password.startsWith("postgres://")) {
    return [password];
  }
  const enc = encodeURIComponent(password);
  // Projeto ifptyzikekrswippzmsf usa pooler aws-1-us-east-1 (Session mode, porta 5432)
  list.push(`postgresql://postgres.${projectRef}:${enc}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`);
  list.push(`postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`);
  for (const region of regions) {
    for (const aws of ["aws-0", "aws-1"]) {
      list.push(
        `postgresql://postgres.${projectRef}:${enc}@${aws}-${region}.pooler.supabase.com:5432/postgres`,
        `postgresql://postgres.${projectRef}:${enc}@${aws}-${region}.pooler.supabase.com:6543/postgres`
      );
    }
  }
  return list;
}

async function connectPg(password: string): Promise<pg.Client> {
  const candidates = buildConnectionCandidates(password);
  let lastError: Error | null = null;
  for (const conn of candidates) {
    const client = new pg.Client({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError ?? new Error("Não foi possível conectar ao Postgres do Supabase.");
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
  console.log("HB Credit — aplicar migrations\n");
  const client = await connectPg(dbPassword);

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
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\nErro:", msg);
  if (/password authentication failed|timeout|connect|terminated/i.test(msg)) {
    console.error("\nAlternativa: Supabase → SQL Editor → cole os arquivos:");
    console.error("  1) supabase/migrations/20260828120000_hb_credit_foundation.sql");
    console.error("  2) supabase/migrations/20260828140000_hb_credit_operational.sql");
    console.error("\nOu copie a URI (Session pooler) em Database → Connection string");
    console.error("e coloque em .env.local como DATABASE_URL=...");
  }
  process.exit(1);
});
