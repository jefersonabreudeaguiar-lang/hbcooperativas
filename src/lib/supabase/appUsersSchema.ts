import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

export function isAppUsersTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = error.message ?? "";
  return /app_users/i.test(msg) && /(could not find|does not exist|schema cache)/i.test(msg);
}

export async function checkAppUsersTable(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("app_users").select("id", { count: "exact", head: true });
  return !error;
}

function loadEnvFile(path: string) {
  try {
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

async function connectPg(connectionString: string): Promise<pg.Client> {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  return client;
}

export async function applyAppUsersSchemaSql(): Promise<{ ok: true } | { ok: false; error: string }> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dbPassword = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_PASSWORD ?? "";
  if (!supabaseUrl || !dbPassword) {
    return { ok: false, error: "DATABASE_URL ou SUPABASE_DB_PASSWORD não configurado." };
  }

  const projectRef = supabaseUrl.replace(/^https:\/\//, "").split(".")[0];
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/APPLY_APP_USERS.sql"),
    "utf8"
  );

  let lastError = "Não foi possível conectar ao Postgres do Supabase.";
  for (const conn of buildConnectionCandidates(projectRef, dbPassword)) {
    const client = await connectPg(conn).catch(() => null);
    if (!client) continue;
    try {
      await client.query(sql);
      await client.end();
      return { ok: true };
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
