/**
 * Sincroniza limites HB Créditos de todos os cooperados ativos com operacional + notas na nuvem.
 * Repara crédito inflado (nunca acima do valor a receber pendente na ficha).
 *
 * Uso:
 *   npx tsx scripts/sync-hb-credit-limites-cooperativa.ts
 *   npx tsx scripts/sync-hb-credit-limites-cooperativa.ts --cnpj 62351750000165
 *   npx tsx scripts/sync-hb-credit-limites-cooperativa.ts --repair-descontos
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { repairOperacionalContaCoopDescontosCooperativa } from "../src/lib/hb-credit/repairOperacionalContaCoopDescontos.ts";
import { resolveAuthoritativeCreditosBaseCents } from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import { syncLimitesCooperadosFromCreditoBase } from "../src/lib/supabase/contaCoopStorage.ts";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";
import { calcLimiteFromPercentual } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceKey) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const cnpjArg = args.find((a) => a.startsWith("--cnpj="))?.split("=")[1]?.replace(/\D/g, "");
const CNPJ = cnpjArg || process.env.HB_RECONCILIATION_COOP_CNPJ?.replace(/\D/g, "") || "62351750000165";
const repairDescontos = args.includes("--repair-descontos");
const ACTOR = process.env.HB_SYNC_ACTOR_USER_ID ?? "script_sync_hb_limites";

const sb = createClient(url, serviceKey, { auth: { persistSession: false }, realtime: { transport: ws } });

async function main() {
  console.log("HB Créditos — sync limites alinhados à ficha");
  console.log("CNPJ:", CNPJ);

  if (repairDescontos) {
    console.log("\n1) Reparo contaCoopDescontos no operacional.json…");
    const repair = await repairOperacionalContaCoopDescontosCooperativa(sb, CNPJ);
    console.log(repair);
  }

  const cooperados = (await fetchCooperadosFromStorage(sb, CNPJ)).filter((c) => c.status === "ativo");
  const ids = cooperados.map((c) => c.id);
  if (!ids.length) {
    console.error("Nenhum cooperado ativo na nuvem.");
    process.exit(1);
  }

  console.log(`\n2) Crédito-base autoritativo (${ids.length} cooperados)…`);
  const creditosBaseCents = await resolveAuthoritativeCreditosBaseCents(sb, CNPJ, ids);
  if (!creditosBaseCents) {
    console.error("operacional.json ou cooperativa não encontrados.");
    process.exit(1);
  }

  const { data: cap } = await sb
    .from("hb_credit_cooperative_caps")
    .select("teto_percent")
    .eq("cooperative_cnpj", CNPJ)
    .maybeSingle();
  const tetoPercent = cap?.teto_percent != null ? Number(cap.teto_percent) : 30;

  let totalBase = 0;
  let totalLimite = 0;
  for (const id of ids) {
    const base = creditosBaseCents[id] ?? 0;
    const lim = calcLimiteFromPercentual(base, tetoPercent);
    totalBase += base;
    totalLimite += lim;
    if (base > 0) {
      console.log(
        `  ${cooperados.find((c) => c.id === id)?.nomeCompleto?.split(" ")[0] ?? id.slice(-8)}: base R$ ${(base / 100).toFixed(2)} → limite ~R$ ${(lim / 100).toFixed(2)}`
      );
    }
  }
  console.log(`  Total base: R$ ${(totalBase / 100).toFixed(2)} | limite distribuível ~R$ ${(totalLimite / 100).toFixed(2)}`);

  console.log("\n3) Aplicando syncLimitesCooperadosFromCreditoBase…");
  const result = await syncLimitesCooperadosFromCreditoBase(sb, CNPJ, ids, creditosBaseCents, ACTOR);
  if (!result.ok) {
    console.error("Falha:", result.error);
    process.exit(1);
  }
  console.log("OK — atualizados:", result.updated, result.errors?.length ? `avisos: ${result.errors.join("; ")}` : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
