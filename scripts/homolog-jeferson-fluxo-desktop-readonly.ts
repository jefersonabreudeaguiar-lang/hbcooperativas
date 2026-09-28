/**
 * Homolog — paridade de fluxo desktop Jeferson vs referência (read-only nuvem).
 * Não copia dados Orlando → Jeferson; valida slice operacional + projeção global.
 *
 * npx tsx scripts/homolog-jeferson-fluxo-desktop-readonly.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import {
  cooperadoFinanceiroDesatualizado,
  cooperadoFinanceiroLocalAusente,
} from "../src/services/fichaSyncGuard";
import { projetarCooperadoFluxoFinanceiroGlobal } from "../src/lib/cooperadoFluxoFinanceiroGlobal.ts";

const ORLANDO = "c_1782263929381_ncp55";
const JEFERSON = "c_1781981564381_w67gg";

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

const CNPJ = (process.env.HOMOLOG_CNPJ ?? "62351750000165").replace(/\D/g, "");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local)");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!coopRows?.length) {
    console.error("Cooperativa não encontrada:", CNPJ);
    process.exit(1);
  }
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);

  const [storageNotas, tableResult, cloudCooperados, operacional] = await Promise.all([
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data: AppData = {
    cooperativas: [coop],
    cooperados: cloudCooperados.map((c) => ({ ...c.cooperado, cooperativaId: coop.id })),
    users: [],
    notasPedido: notas,
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
    auditLog: [],
  } as AppData;

  if (operacional) {
    data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  }

  const ready = { role: "cooperado" as const, cooperadoPagamentosHydrated: true, syncing: false };

  type Row = {
    id: string;
    nome: string;
    fichas: number;
    pagamentos: number;
    localAusente: boolean;
    desatualizado: boolean;
    proj: ReturnType<typeof projetarCooperadoFluxoFinanceiroGlobal>;
  };

  const rows: Row[] = [];
  for (const [id, nome] of [
    [ORLANDO, "Orlando (ref. comportamento)"],
    [JEFERSON, "Jeferson (teste homolog)"],
  ] as const) {
    const canon = resolverCooperadoIdCanonico(data, id, coop.id);
    rows.push({
      id: canon,
      nome,
      fichas: data.fichaCorrida.filter((f) => f.cooperadoId === canon).length,
      pagamentos: data.pagamentosCooperado.filter((p) => p.cooperadoId === canon).length,
      localAusente: cooperadoFinanceiroLocalAusente(data, canon, coop.id),
      desatualizado: cooperadoFinanceiroDesatualizado(data, canon, coop.id),
      proj: projetarCooperadoFluxoFinanceiroGlobal(data, canon, coop.id, ready),
    });
  }

  console.log(JSON.stringify({ cnpj: CNPJ, coopId: coop.id, rows }, null, 2));

  const j = rows.find((r) => r.id === JEFERSON)!;
  const o = rows.find((r) => r.id === ORLANDO)!;

  if (j.localAusente) {
    console.error("\nHOMOLOG: slice financeiro Jeferson ausente no operacional — após deploy, login cooperado + sync completo.");
    process.exit(2);
  }

  console.log("\nFluxo global OK (mesma projeção, readiness=sync concluído). Valores diferem por dados próprios — esperado.");
  console.log("Orlando motor:", o.proj.motorValor, "| Jeferson motor:", j.proj.motorValor);
  process.exit(j.desatualizado ? 3 : 0);
}

void main();
