import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchNotasFromTable,
  fetchNotasFromStorage,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage.ts";
import {
  normalizarTotaisNotaDesdeItens,
  notaTotaisCoerentesComItens,
} from "../src/services/notaPedidoService.ts";

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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const table = await fetchNotasFromTable(sb, CNPJ);
  const storage = await fetchNotasFromStorage(sb, CNPJ);
  const notas = mergeNotasSources(table.notas, storage);
  let inc = 0;
  let would = 0;
  for (const n of notas) {
    if (n.status !== "conferida" && n.status !== "pago") continue;
    if (!notaTotaisCoerentesComItens(n)) inc++;
    const fixed = normalizarTotaisNotaDesdeItens(n);
    if (JSON.stringify(fixed) !== JSON.stringify(n)) would++;
  }
  console.log({
    lancadas: notas.filter((n) => n.status === "conferida" || n.status === "pago").length,
    incoerentes: inc,
    wouldPatch: would,
  });
}

main();
