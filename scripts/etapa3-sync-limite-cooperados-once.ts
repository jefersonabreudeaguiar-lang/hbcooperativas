/**
 * Etapa 3 — aplica sync-limite (service role) como POST /api/credit/sync-limite.
 * Uso:
 *   npx tsx scripts/etapa3-sync-limite-cooperados-once.ts
 *   npx tsx scripts/etapa3-sync-limite-cooperados-once.ts --ids=c_1781981564381_w67gg
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { resolveAuthoritativeCreditosBaseCents } from "../src/modules/hb-credit/engine/creditBaseAuthoritative.ts";
import { syncLimiteCooperadoFromCreditoBase } from "../src/lib/supabase/contaCoopStorage.ts";
import { markHbCreditLimitSynced } from "../src/modules/hb-credit/engine/hbCreditLimitSyncState.ts";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";

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
if (
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL &&
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ &&
  !process.env.HB_BIC_LAB_B4_AUTHORITY
) {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
}

const CNPJ = "62351750000165";
const ACTOR = process.env.HB_SYNC_ACTOR_USER_ID ?? "script_etapa3_sync_limite";
const idsArg = process.argv.find((a) => a.startsWith("--ids="))?.split("=")[1];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  let ids = idsArg?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  if (!ids.length) {
    const cooperados = (await fetchCooperadosFromStorage(sb, CNPJ)).filter((c) => c.status === "ativo");
    const allIds = cooperados.map((c) => c.id);
    const bases = await resolveAuthoritativeCreditosBaseCents(sb, CNPJ, allIds);
    if (!bases) throw new Error("operacional indisponível");
    ids = allIds.filter((id) => (bases[id] ?? 0) > 0);
    if (!ids.length) {
      console.log("Nenhum cooperado com crédito-base > 0 — nada a sincronizar.");
      return;
    }
    console.log("Cooperados com base > 0:", ids.length);
  }

  const creditosBaseCents = await resolveAuthoritativeCreditosBaseCents(sb, CNPJ, ids);
  if (!creditosBaseCents) throw new Error("operacional indisponível");

  for (const id of ids) {
    const base = creditosBaseCents[id] ?? 0;
    console.log(`\n→ ${id} base R$ ${(base / 100).toFixed(2)}`);
    const result = await syncLimiteCooperadoFromCreditoBase(sb, CNPJ, id, base, ACTOR, creditosBaseCents);
    console.log(result);
    if (!result.ok) continue;
    const mark = await markHbCreditLimitSynced(sb, { cnpj: CNPJ, cooperadoId: id, actorUserId: ACTOR });
    console.log("mark SYNCED:", mark);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
