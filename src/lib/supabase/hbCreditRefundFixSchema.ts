import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

async function queryPg<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const candidates: string[] = [];
  if (databaseUrl) candidates.push(databaseUrl);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim() ?? "";
  const projectRef =
    process.env.SUPABASE_PROJECT_REF?.trim() || supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
  if (projectRef && dbPassword) {
    candidates.push(...buildConnectionCandidates(projectRef, dbPassword));
  }

  for (const conn of candidates) {
    const client = await connectPg(conn);
    if (!client) continue;
    try {
      const result = await client.query(sql, params);
      return result.rows as T;
    } catch {
      /* try next */
    } finally {
      await client.end().catch(() => {});
    }
  }
  return null;
}

export async function checkHbCreditRefundFixSchema(_supabase: SupabaseClient): Promise<{
  refundRpcUsesNullIntent: boolean;
  refundRpcUsesCreditDebitedRestore: boolean;
  ok: boolean;
}> {
  void _supabase;
  const rows = await queryPg<{ uses_null: boolean; uses_credit_restore: boolean }[]>(
    `select prosrc like '%v_account.id, null,%' as uses_null,
            prosrc like '%v_credit_restore := coalesce(v_tx.credit_debited_cents%' as uses_credit_restore
     from pg_proc
     where proname = 'hb_credit_refund_payment'
     limit 1`
  );
  const refundRpcUsesNullIntent = Boolean(rows?.[0]?.uses_null);
  const refundRpcUsesCreditDebitedRestore = Boolean(rows?.[0]?.uses_credit_restore);
  return {
    refundRpcUsesNullIntent,
    refundRpcUsesCreditDebitedRestore,
    ok: refundRpcUsesNullIntent && refundRpcUsesCreditDebitedRestore,
  };
}

/** A versão antiga substitui a composição atual do estorno; nunca reaplicar. */
export async function applyHbCreditRefundFixSchemaSql(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Reparo legado desativado. Aplique somente as migrations atuais revisadas pelo processo de lançamento." };
}

export function humanizeCreditRefundError(message: string): string {
  if (/payment_intent_id.*already exists|23505|hb_credit_transactions_payment_intent_id_key/i.test(message)) {
    return "Estorno bloqueado por inconsistência no banco. Solicite à administração a conferência das migrations atuais antes de tentar novamente.";
  }
  return message;
}
