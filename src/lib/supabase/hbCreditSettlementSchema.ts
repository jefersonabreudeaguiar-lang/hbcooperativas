import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SETTLEMENT_MIGRATION_SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260828240000_hb_credit_settlement.sql"),
  "utf8"
);

function loadEnvFile(path: string) {
  try {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
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
  } catch {
    /* optional */
  }
}

function buildConnectionCandidates(projectRef: string, password: string): string[] {
  if (password.startsWith("postgresql://") || password.startsWith("postgres://")) {
    return [password];
  }
  const enc = encodeURIComponent(password);
  const regions = ["us-east-1", "sa-east-1", "us-east-2", "us-west-1", "eu-west-1"];
  const list: string[] = [
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

async function connectPg(connectionString: string): Promise<pg.Client | null> {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
    return client;
  } catch {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function checkHbCreditSettlementSchema(supabase: SupabaseClient): Promise<{
  pixColumnsOk: boolean;
  settlementsTableOk: boolean;
  receivableSettlementIdOk: boolean;
  ok: boolean;
}> {
  const pix = await supabase.from("hb_credit_partners").select("pix_key").limit(1);
  const pixColumnsOk = !pix.error || !/pix_key/i.test(pix.error.message ?? "");

  const settlements = await supabase.from("hb_credit_settlements").select("id").limit(1);
  const settlementsTableOk = !settlements.error || !/hb_credit_settlements/i.test(settlements.error.message ?? "");

  const receb = await supabase.from("hb_credit_receivables").select("settlement_id").limit(1);
  const receivableSettlementIdOk =
    !receb.error || !/settlement_id/i.test(receb.error.message ?? "");

  return {
    pixColumnsOk,
    settlementsTableOk,
    receivableSettlementIdOk,
    ok: pixColumnsOk && settlementsTableOk && receivableSettlementIdOk,
  };
}

export async function applyHbCreditSettlementSchemaSql(): Promise<
  { ok: true; applied: string } | { ok: false; error: string }
> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dbPassword = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_PASSWORD ?? "";
  if (!supabaseUrl || !dbPassword) {
    return { ok: false, error: "DATABASE_URL ou SUPABASE_DB_PASSWORD não configurado." };
  }

  const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
  let lastError = "Não foi possível conectar ao Postgres do Supabase.";

  for (const conn of buildConnectionCandidates(projectRef, dbPassword)) {
    const client = await connectPg(conn);
    if (!client) continue;
    try {
      await client.query(SETTLEMENT_MIGRATION_SQL);
      await client.end();
      return { ok: true, applied: "20260828240000_hb_credit_settlement.sql" };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }

  return { ok: false, error: lastError };
}
