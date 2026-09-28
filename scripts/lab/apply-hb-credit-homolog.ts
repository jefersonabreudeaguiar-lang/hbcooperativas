#!/usr/bin/env npx tsx
/**
 * Aplica HB Créditos na homolog do LAB (.env.bic-lab).
 * Usa SUPABASE_DB_PASSWORD de .env.local se não estiver em .env.bic-lab.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { loadBicLabEnv } from "./loadBicLabEnv";
import { evaluateProductionGuard } from "../lib/assertNotProductionTarget.mjs";

function loadDbPasswordFallback(cwd: string) {
  if (process.env.SUPABASE_DB_PASSWORD?.trim()) return;
  const local = resolve(cwd, ".env.local");
  if (!existsSync(local)) return;
  for (const line of readFileSync(local, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("SUPABASE_DB_PASSWORD=")) continue;
    process.env.SUPABASE_DB_PASSWORD = trimmed.slice("SUPABASE_DB_PASSWORD=".length).trim().replace(/^["']|["']$/g, "");
    break;
  }
}

function buildConnectionCandidates(projectRef: string, password: string): string[] {
  if (password.startsWith("postgresql://") || password.startsWith("postgres://")) {
    return [password];
  }
  const enc = encodeURIComponent(password);
  const regions = ["sa-east-1", "us-east-1", "us-east-2"];
  const list: string[] = [];
  list.push(`postgresql://postgres.${projectRef}:${enc}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`);
  list.push(`postgresql://postgres:${enc}@db.${projectRef}.supabase.co:5432/postgres`);
  for (const region of regions) {
    for (const aws of ["aws-0", "aws-1"]) {
      list.push(`postgresql://postgres.${projectRef}:${enc}@${aws}-${region}.pooler.supabase.com:5432/postgres`);
    }
  }
  return list;
}

async function connectPg(projectRef: string, password: string): Promise<pg.Client> {
  let last: Error | null = null;
  for (const conn of buildConnectionCandidates(projectRef, password)) {
    const client = new pg.Client({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 25_000,
    });
    try {
      await client.connect();
      return client;
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw last ?? new Error("Falha ao conectar Postgres homolog.");
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const res = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [table]
  );
  return (res.rowCount ?? 0) > 0;
}

async function main() {
  const cwd = process.cwd();
  loadBicLabEnv(cwd);
  loadDbPasswordFallback(cwd);

  const guard = evaluateProductionGuard(process.env);
  if (!guard.allowed) {
    console.error(guard.message);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const projectRef = url.replace(/^https:\/\//, "").split(".")[0];
  const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? "";

  console.log("HB Créditos — homolog LAB");
  console.log("Supabase ref:", projectRef);
  console.log("APP_ENV:", process.env.APP_ENV ?? "(unset)");

  if (!dbPassword) {
    console.error(
      "Defina SUPABASE_DB_PASSWORD em .env.local ou .env.bic-lab (senha Postgres do projeto homolog)."
    );
    process.exit(1);
  }

  const client = await connectPg(projectRef, dbPassword);
  try {
    if (!(await tableExists(client, "cooperativas"))) {
      throw new Error("Tabela cooperativas ausente — abortando.");
    }

    const hasAccounts = await tableExists(client, "hb_credit_accounts");
    const hasTx = await tableExists(client, "hb_credit_transactions");

    if (hasAccounts && hasTx) {
      console.log("\nHB Créditos já presente (accounts + transactions). Nada a aplicar.");
      return;
    }

    console.log("\nAplicando supabase/migrations/APPLY_HB_CREDIT_TUDO.sql …");
    const sql = readFileSync(resolve(cwd, "supabase/migrations/APPLY_HB_CREDIT_TUDO.sql"), "utf8");
    await client.query(sql);

    const okAccounts = await tableExists(client, "hb_credit_accounts");
    const okTx = await tableExists(client, "hb_credit_transactions");
    const okCaps = await tableExists(client, "hb_credit_cooperative_caps");

    if (!okAccounts || !okTx) {
      throw new Error("Verificação pós-migration falhou (accounts ou transactions).");
    }

    console.log("\nOK — hb_credit_accounts, hb_credit_transactions, caps:", okCaps);
    console.log("Próximo: npm run lab:check-homolog → dev:bic-lab → responsável libera limite.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nErro:", err instanceof Error ? err.message : err);
  console.error(
    "\nAlternativa: Supabase homolog → SQL Editor → cole APPLY_HB_CREDIT_TUDO.sql manualmente."
  );
  process.exit(1);
});
