/**
 * Aplica na nuvem (service role / .env.local):
 * - 20261027143000_hb_credit_manual_valor_bruto.sql
 * - 20261027180000_hb_credit_cooperado_ficha_plano.sql
 *
 * Uso: npx tsx scripts/apply-hb-v2-ficha-migrations-once.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? "";

async function probe(sb: ReturnType<typeof createClient>) {
  const ficha = await sb.from("hb_credit_cooperado_ficha_plano").select("cooperative_cnpj").limit(1);
  const manual = await sb.from("hb_credit_accounts").select("manual_valor_bruto_cents").limit(1);
  const historico = await sb
    .from("hb_credit_cooperado_ficha_plano")
    .select("historico_ciclos")
    .limit(1);
  return {
    ficha: ficha.error?.message ?? "ok",
    manual: manual.error?.message ?? "ok",
    historico: historico.error?.message ?? "ok",
  };
}

async function applyViaPg(sql: string) {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!url || !key) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");

  const ref = url.match(/https:\/\/([^.]+)/)?.[1] ?? "?";
  console.log("supabase_ref:", ref);

  const sb = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const before = await probe(sb);
  console.log("antes:", before);

  const needsBase = before.ficha !== "ok" || before.manual !== "ok";
  const needsHistorico = before.historico !== "ok";

  if (!needsBase && !needsHistorico) {
    console.log("Migrations V2 ficha já aplicadas — nada a fazer.");
    return;
  }

  if (!dbUrl) {
    console.error(
      "Para criar a tabela, defina SUPABASE_DB_URL (ou DATABASE_URL) em .env.local — connection string Postgres do projeto Supabase."
    );
    console.error("Dashboard Supabase → Project Settings → Database → Connection string (URI).");
    process.exit(2);
  }

  const migrations = needsBase
    ? [
        "20261027143000_hb_credit_manual_valor_bruto.sql",
        "20261027180000_hb_credit_cooperado_ficha_plano.sql",
        "20261027200000_hb_credit_ficha_plano_historico.sql",
      ]
    : ["20261027200000_hb_credit_ficha_plano_historico.sql"];

  for (const name of migrations) {
    const path = resolve(process.cwd(), "supabase/migrations", name);
    const sql = readFileSync(path, "utf8");
    console.log("aplicando:", name);
    await applyViaPg(sql);
  }

  const client = new (await import("pg")).default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const reg = await client.query(
    `select to_regclass('public.hb_credit_cooperado_ficha_plano') as tbl`
  );
  await client.end();
  console.log("pg_to_regclass:", reg.rows[0]?.tbl ?? null);

  await new Promise((r) => setTimeout(r, 3000));
  const after = await probe(sb);
  console.log("depois:", after);
  if (after.ficha !== "ok" && !reg.rows[0]?.tbl) {
    console.error("Falha: tabela hb_credit_cooperado_ficha_plano ainda indisponível.");
    process.exit(1);
  }
  if (after.ficha !== "ok" && reg.rows[0]?.tbl) {
    console.log(
      "Tabela existe no Postgres; PostgREST pode levar alguns segundos para atualizar o cache. Tente salvar a ficha de novo."
    );
  }
  console.log("ok: migrations V2 ficha aplicadas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
