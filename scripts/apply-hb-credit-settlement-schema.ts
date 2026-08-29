/**
 * Aplica migration de liquidação HB Credit (PIX mercado + settlements).
 * Uso: npx tsx scripts/apply-hb-credit-settlement-schema.ts
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
const dbPassword = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_PASSWORD ?? "";

function buildConnectionCandidates(projectRef: string, password: string): string[] {
  if (password.startsWith("postgresql://") || password.startsWith("postgres://")) {
    return [password];
  }
  const enc = encodeURIComponent(password);
  const regions = ["us-east-1", "sa-east-1", "us-east-2", "us-west-1", "eu-west-1"];
  const list = [
    `postgresql://postgres.${projectRef}:${enc}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`,
  ];
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
  const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
  let lastError: Error | null = null;
  for (const conn of buildConnectionCandidates(projectRef, password)) {
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

async function columnExists(client: pg.Client, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = $2 limit 1`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [table]
  );
  return (res.rowCount ?? 0) > 0;
}

async function checkSchema(client: pg.Client) {
  const pixColumnsOk = await columnExists(client, "hb_credit_partners", "pix_key");
  const settlementsTableOk = await tableExists(client, "hb_credit_settlements");
  const receivableSettlementIdOk = await columnExists(client, "hb_credit_receivables", "settlement_id");
  return {
    pixColumnsOk,
    settlementsTableOk,
    receivableSettlementIdOk,
    ok: pixColumnsOk && settlementsTableOk && receivableSettlementIdOk,
  };
}

async function main() {
  console.log("HB Credit — migration liquidação mercado\n");

  if (!supabaseUrl || !dbPassword) {
    console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_DB_PASSWORD em .env.local");
    process.exit(1);
  }

  const client = await connectPg(dbPassword);
  try {
    const before = await checkSchema(client);
    console.log("Antes:", before);

    if (before.ok) {
      console.log("\nMigration já aplicada.");
      return;
    }

    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260828240000_hb_credit_settlement.sql"),
      "utf8"
    );
    console.log("\nAplicando migration...");
    await client.query(sql);

    const after = await checkSchema(client);
    console.log("Depois:", after);

    if (!after.ok) {
      throw new Error("Verificação pós-migration falhou.");
    }

    console.log("\nConcluído: liquidação de mercados pronta no Supabase.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nErro:", err instanceof Error ? err.message : err);
  process.exit(1);
});
