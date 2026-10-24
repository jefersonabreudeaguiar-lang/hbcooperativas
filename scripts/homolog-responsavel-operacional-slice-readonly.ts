/**
 * Homolog R4 — operacional.json da cooperativa piloto (read-only, contagens mínimas).
 * npx tsx scripts/homolog-responsavel-operacional-slice-readonly.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CNPJ = "62351750000165";

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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SKIP homolog responsável nuvem — sem .env.local");
    process.exit(0);
  }

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: blob, error } = await sb.storage
    .from("hb-cooperativa-sync")
    .download(`${CNPJ}/operacional.json`);
  if (error || !blob) {
    console.error("operacional.json indisponível:", error?.message ?? "sem blob");
    process.exit(1);
  }
  const operacional = JSON.parse(await blob.text()) as {
    cooperados?: unknown[];
    notasPedido?: unknown[];
    fichaCorrida?: unknown[];
    pagamentosCooperado?: unknown[];
  };
  const summary = {
    cnpj: CNPJ,
    cooperados: operacional.cooperados?.length ?? 0,
    notasPedido: operacional.notasPedido?.length ?? 0,
    fichaCorrida: operacional.fichaCorrida?.length ?? 0,
    pagamentosCooperado: operacional.pagamentosCooperado?.length ?? 0,
  };
  console.log(JSON.stringify(summary, null, 2));

  const massaOk =
    summary.fichaCorrida >= 1 &&
    (summary.cooperados >= 1 || summary.notasPedido >= 1 || summary.pagamentosCooperado >= 1);
  if (!massaOk) {
    console.error("HOMOLOG: operacional sem massa mínima para gestão (ficha + nota/pagamento/cooperado)");
    process.exit(2);
  }
  console.log("OK homolog-responsavel-operacional-slice-readonly");
}

void main();
