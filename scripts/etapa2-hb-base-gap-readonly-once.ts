/**
 * Etapa 2 (read-only): cooperados com «A receber» (consolidado) > 0 mas base autoritativa 0.
 * npx tsx scripts/etapa2-hb-base-gap-readonly-once.ts [cnpj]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { getConsolidadoFinanceiroCooperado } from "../src/services/cooperadoEntregasService";
import {
  buildCreditosBaseAuthoritativeFromCloud,
  resolveAuthoritativeCreditBase,
} from "../src/modules/hb-credit/engine/creditBaseAuthoritative";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  if (
    !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL &&
    !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ &&
    !process.env.HB_BIC_LAB_B4_AUTHORITY
  ) {
    process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
  }
}

loadEnv();

async function main() {
  const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);
  const cooperados = (await fetchCooperadosFromStorage(sb, CNPJ)).filter((c) => c.status === "ativo");
  const ids = cooperados.map((c) => c.id);

  const auth = await resolveAuthoritativeCreditBase(sb, CNPJ, ids);
  if (!auth.ok) throw new Error(auth.message);

  const gaps: { nome: string; id: string; receber: number; baseAuth: number }[] = [];
  let withReceber = 0;
  let withBase = 0;

  for (const c of cooperados) {
    const fin = getConsolidadoFinanceiroCooperado(auth.creditoBaseAppData, c.id, coop.id);
    const base = (auth.creditosBaseCents[c.id] ?? 0) / 100;
    if (fin.valorLiquido > 0.01) withReceber++;
    if (base > 0.01) withBase++;
    if (fin.valorLiquido > 0.01 && base <= 0.01) {
      gaps.push({ nome: c.nomeCompleto, id: c.id, receber: fin.valorLiquido, baseAuth: base });
    }
  }

  console.log(`Etapa 2 gap | ${CNPJ} | ativos ${cooperados.length}`);
  console.log(`Com A receber (consolidado): ${withReceber} | base autoritativa > 0: ${withBase} | gap: ${gaps.length}`);
  for (const g of gaps.sort((a, b) => b.receber - a.receber)) {
    console.log(`  ${g.nome.split(" ")[0]}: receber R$ ${g.receber.toFixed(2)} | base R$ ${g.baseAuth.toFixed(2)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
