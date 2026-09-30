/**
 * Lista lançamentos do livro caixa na nuvem (filtro mercado teste / R$ 100).
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage.ts";

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

const CNPJ = (process.argv[2] ?? "62351750000165").replace(/\D/g, "");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) throw new Error("operacional.json ausente");

  const all = op.livroCaixa ?? [];
  console.log("Total livroCaixa:", all.length);
  const hits = all.filter((l) => /mercado\s*teste/i.test(l.historico ?? ""));
  for (const l of hits) {
    console.log("---");
    console.log(JSON.stringify(l, null, 2));
  }
  if (!hits.length) {
    console.log("(nenhum hit — listando últimos 15 por createdAt)");
    const sorted = [...all].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    for (const l of sorted.slice(0, 15)) {
      console.log(`${l.data} | ${l.tipo} | R$ ${l.valor} | ${l.origem} | ${l.historico?.slice(0, 80)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
