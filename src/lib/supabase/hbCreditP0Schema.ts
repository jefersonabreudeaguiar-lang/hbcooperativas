import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

const P0_MIGRATION_SQL = [
  `-- Teto global em percentual
alter table public.hb_credit_cooperative_caps
  add column if not exists global_credit_cap_percent numeric(5, 2)
  check (global_credit_cap_percent >= 0 and global_credit_cap_percent <= 100);

update public.hb_credit_cooperative_caps
set global_credit_cap_percent = 100
where global_credit_cap_percent is null;`,
  `-- Proteção PIN financeiro
alter table public.hb_credit_accounts
  add column if not exists pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0);

alter table public.hb_credit_accounts
  add column if not exists pin_locked_until timestamptz;

alter table public.hb_credit_accounts
  add column if not exists pin_updated_at timestamptz;`,
];

function loadEnvFile(path: string) {
  try {
    const { readFileSync, existsSync } = require("node:fs") as typeof import("node:fs");
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
  const list: string[] = [`postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`];
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

export async function checkHbCreditP0Schema(supabase: SupabaseClient): Promise<{
  capPercentOk: boolean;
  pinSecurityOk: boolean;
}> {
  const cap = await supabase.from("hb_credit_cooperative_caps").select("global_credit_cap_percent").limit(1);
  const capPercentOk = !cap.error || !/global_credit_cap_percent/i.test(cap.error.message ?? "");

  const pin = await supabase.from("hb_credit_accounts").select("pin_failed_attempts").limit(1);
  const pinSecurityOk = !pin.error || !/pin_failed_attempts/i.test(pin.error.message ?? "");

  return { capPercentOk, pinSecurityOk };
}

export async function applyHbCreditP0SchemaSql(): Promise<
  { ok: true; applied: string[] } | { ok: false; error: string }
> {
  loadEnvFile(require("node:path").resolve(process.cwd(), ".env.local"));

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
      const applied: string[] = [];
      for (let i = 0; i < P0_MIGRATION_SQL.length; i++) {
        await client.query(P0_MIGRATION_SQL[i]!);
        applied.push(`p0_migration_${i + 1}`);
      }
      await client.end();
      return { ok: true, applied };
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
