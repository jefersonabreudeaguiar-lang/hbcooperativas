/**
 * Reconcilia operacional.json × transações HB (todos os cooperados com ficha/pagamento em aberto).
 *
 * npx tsx scripts/repair-conta-coop-descontos-cooperativa.ts
 * npx tsx scripts/repair-conta-coop-descontos-cooperativa.ts --cooperado c_1782263929381_ncp55
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCnpj } from "../src/utils/cooperativa";
import {
  collectContaCoopSyncJobs,
  repairOperacionalContaCoopDescontosCooperativa,
  repairOperacionalContaCoopDescontosForCooperado,
} from "../src/lib/hb-credit/repairOperacionalContaCoopDescontos";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Configure .env.local");
  process.exit(1);
}

const CNPJ = normalizeCnpj(process.argv.find((a) => /^\d{14}$/.test(a)) ?? "62351750000165");
const cooperadoArg = process.argv.find((a) => a.startsWith("c_"));
const cooperadoFlag = process.argv.indexOf("--cooperado");
const cooperadoId =
  cooperadoArg ?? (cooperadoFlag >= 0 ? process.argv[cooperadoFlag + 1] : undefined);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  const opBefore = await fetchOperacionalSync(supabase, CNPJ);
  if (!opBefore) {
    console.error("operacional.json não encontrado");
    process.exit(1);
  }

  const jobs = collectContaCoopSyncJobs(opBefore, cooperadoId);
  console.log(`CNPJ ${CNPJ} — ${jobs.length} job(s) HB×ficha${cooperadoId ? ` (filtro ${cooperadoId})` : ""}`);
  for (const j of jobs.slice(0, 40)) {
    console.log(`  • ${j.cooperadoId} · ${j.mesReferencia}`);
  }
  if (jobs.length > 40) console.log(`  … +${jobs.length - 40}`);

  const result = cooperadoId
    ? await repairOperacionalContaCoopDescontosForCooperado(supabase, CNPJ, cooperadoId)
    : await repairOperacionalContaCoopDescontosCooperativa(supabase, CNPJ);

  console.log("\nResultado:", result);
  console.log(result.patched > 0 ? "✓ operacional.json atualizado na nuvem" : "✓ já estava alinhado (0 alterações)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
