/**
 * Etapa 2 — detalhe dos gaps (read-only).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { getConsolidadoFinanceiroCooperado } from "../src/services/cooperadoEntregasService";
import { resolveAuthoritativeCreditBase } from "../src/modules/hb-credit/engine/creditBaseAuthoritative";
import {
  hbCreditCreditoBaseBrutoFichaAbertoReais,
  hbCreditValorAReceberAgregado,
} from "../src/lib/hb-credit/hbCreditLeituraBic";
import { cooperadoTemEntregasConferidasParaHb } from "../src/modules/hb-credit/engine/creditBaseHbGuard";
import { cooperadoFichaValoresDesalinhados } from "../src/services/fichaSyncGuard";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  if (!process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL) {
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
  const coop = cooperativaFromCloudRow(coopRows![0] as Record<string, unknown>);
  const cooperados = (await fetchCooperadosFromStorage(sb, CNPJ)).filter((c) => c.status === "ativo");
  const auth = await resolveAuthoritativeCreditBase(sb, CNPJ, cooperados.map((c) => c.id));
  if (!auth.ok) throw new Error(auth.message);
  const data = auth.creditoBaseAppData;

  for (const c of cooperados) {
    const fin = getConsolidadoFinanceiroCooperado(data, c.id, coop.id);
    const base = (auth.creditosBaseCents[c.id] ?? 0) / 100;
    if (fin.valorLiquido <= 0.01 || base > 0.01) continue;
    const m6 = hbCreditValorAReceberAgregado(data, c.id, coop.id, { apresentacaoConsolidada: true });
    const bruto = hbCreditCreditoBaseBrutoFichaAbertoReais(data, c.id, coop.id);
    const conferidas = cooperadoTemEntregasConferidasParaHb(data, c.id, coop.id);
    const desal = cooperadoFichaValoresDesalinhados(data, c.id, coop.id);
    console.log(`\n${c.nomeCompleto}`);
    console.log(`  receber R$ ${fin.valorLiquido.toFixed(2)} | base auth R$ ${base.toFixed(2)} | bruto aberto R$ ${bruto.toFixed(2)}`);
    console.log(
      `  m6: ${m6.valor} aguard:${m6.aguardandoAssinatura} | conferidas:${conferidas} | ficha desalinhada:${desal}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
