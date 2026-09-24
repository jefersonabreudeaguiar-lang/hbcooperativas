/**
 * Cria tabela notas_pedido (se faltar) e backfill a partir do storage hb-entregas.
 * Uso: npx tsx scripts/apply-notas-pedido-migration-and-backfill.ts [--cnpj=62351750000165] [--dry-run]
 */
import ws from "ws";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { runPgSql } from "../src/lib/supabase/pgSqlRunner";
import {
  fetchNotasFromStorage,
  notaPayloadForTable,
  upsertNotasInTable,
} from "../src/lib/supabase/notasStorage";
import { isNotaNaFilaConferenciaResponsavel } from "../src/utils/notaStatus";
import { assertNotProductionTarget } from "./lib/assertNotProductionTarget.mjs";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const cnpjArg = process.argv.find((a) => a.startsWith("--cnpj="));
const CNPJ = (cnpjArg?.split("=")[1] ?? "62351750000165").replace(/\D/g, "");
const DRY = process.argv.includes("--dry-run");
const SKIP_MIGRATION = process.argv.includes("--skip-migration");

async function main() {
  if (!DRY) assertNotProductionTarget();
  if (CNPJ.length !== 14) {
    console.error("CNPJ inválido");
    process.exit(1);
  }

  const migrationPath = "supabase/migrations/20260620120000_notas_pedido.sql";
  const sql = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

  console.log(DRY ? "[dry-run] " : "", SKIP_MIGRATION ? "Pulando migration (--skip-migration)…" : "Aplicando migration notas_pedido…");
  if (!DRY && !SKIP_MIGRATION) {
    const mig = await runPgSql(sql);
    if (!mig.ok) {
      console.error("Migration falhou:", mig.error);
      process.exit(1);
    }
    console.log("Migration ok.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const storageNotas = await fetchNotasFromStorage(sb, CNPJ);
  const publicaveis = storageNotas.filter((n) => n.status !== "rascunho");
  const fila = publicaveis.filter((n) => isNotaNaFilaConferenciaResponsavel(n.status));

  console.log(`Storage: ${storageNotas.length} notas, ${publicaveis.length} não-rascunho, ${fila.length} na fila.`);

  if (DRY) {
    console.log("Dry-run — nenhum upsert.");
    return;
  }

  const BATCH = 40;
  let upserted = 0;
  for (let i = 0; i < publicaveis.length; i += BATCH) {
    const chunk = publicaveis.slice(i, i + BATCH).map(notaPayloadForTable);
    const res = await upsertNotasInTable(sb, CNPJ, chunk);
    if (!res.ok) {
      console.error("Upsert falhou:", res);
      process.exit(1);
    }
    upserted += chunk.length;
  }

  const { count, error } = await sb
    .from("notas_pedido")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_cnpj", CNPJ);
  if (error) {
    console.warn("Contagem pós-backfill:", error.message);
  }

  const { count: filaCount } = await sb
    .from("notas_pedido")
    .select("id", { count: "exact", head: true })
    .eq("cooperativa_cnpj", CNPJ)
    .in("status", ["aguardando_conferencia", "entregue"]);

  console.log(`Backfill: ${upserted} upsert(s). Tabela: ${count ?? "?"} linhas, fila SQL: ${filaCount ?? "?"}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
