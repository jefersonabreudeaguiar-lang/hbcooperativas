import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";

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

const ORLANDO = "c_1782263929381_ncp55";
const CNPJ = normalizeCnpj("62351750000165");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("env");
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const op = await fetchOperacionalSync(sb, CNPJ);
  const notas = mergeNotasSources(
    (await fetchNotasFromTable(sb, CNPJ)).notas,
    await fetchNotasFromStorage(sb, CNPJ)
  );
  const orlNotas = notas.filter((n) => n.cooperadoId === ORLANDO && n.mesReferencia === "2026-09");
  console.log("NOTAS SET/2026:");
  for (const n of orlNotas.sort((a, b) => a.numeroNota.localeCompare(b.numeroNota))) {
    console.log(JSON.stringify({ id: n.id, numero: n.numeroNota, status: n.status, liq: n.valorLiquido, data: n.dataEntrega }));
  }
  const pg = (op?.pagamentosCooperado ?? []).filter((p) => p.cooperadoId === ORLANDO);
  console.log("\nPAGAMENTOS:");
  console.log(JSON.stringify(pg, null, 2));
  const fi = (op?.fichaCorrida ?? []).filter((f) => f.cooperadoId === ORLANDO && f.mesReferencia === "2026-09");
  console.log("\nFICHAS SET/2026:");
  console.log(JSON.stringify(fi, null, 2));
  const des = (op?.descontos ?? []).filter((d) => d.cooperadoId === ORLANDO && d.mesReferencia === "2026-09");
  console.log("\nDESCONTOS SET/2026:", des.length);
  for (const d of des) console.log(JSON.stringify(d));
}

main().catch(console.error);
