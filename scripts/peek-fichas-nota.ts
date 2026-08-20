/** Lista fichas da nota dividida np_1787160875774_sem0t */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";

function dividirValorEntrega(total: number, index: number, count: number): number {
  if (count <= 0) return 0;
  const base = Math.floor((total * 100) / count) / 100;
  const resto = Math.round(total * 100 - base * count * 100);
  return base + (index < resto ? 0.01 : 0);
}

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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const NOTA = "np_1787160875774_sem0t";
const TOTAL = 3928.99;
const N = 3;

async function main() {
  const op = await fetchOperacionalSync(supabase, "62351750000165");
  const fichas = (op?.fichaCorrida ?? []).filter((f) => f.notaPedidoId === NOTA);
  console.log("Fichas na nuvem para nota", NOTA, ":", fichas.length);
  for (const f of fichas) {
    console.log(`  ${f.cooperadoNomeSnapshot ?? f.cooperadoId} | ${f.valorLiquido} | status=${f.status} | id=${f.id.slice(0, 20)}`);
  }
  console.log("\nDivisão esperada (1/3 cada):");
  for (let i = 0; i < N; i++) {
    console.log(`  parte ${i + 1}: ${dividirValorEntrega(TOTAL, i, N).toFixed(2)}`);
  }
  console.log("Soma esperada:", [0, 1, 2].reduce((s, i) => s + dividirValorEntrega(TOTAL, i, N), 0).toFixed(2));
}
main().catch(console.error);
