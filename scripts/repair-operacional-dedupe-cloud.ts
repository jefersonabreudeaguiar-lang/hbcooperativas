/**
 * Deduplica e reconcilia fichaCorrida na nuvem (operacional.json).
 * Uso: npx tsx scripts/repair-operacional-dedupe-cloud.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  dedupeFichaCorridaPorNota,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";

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

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");

function emptyAppData(): AppData {
  return {
    cooperativas: [],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    ajustesFichaMes: [],
    entregas: [],
    descontos: [],
    valoresAvulsosReceber: [],
    pagamentos: [],
    financeiro: [],
    comunicados: [],
    reclamacoes: [],
    votacaoPautas: [],
    votacaoVotos: [],
    propriedades: [],
    veiculos: [],
    fechamentos: [],
    livroCaixa: [],
    prestacoesContas: [],
    auditLog: [],
    config: { descontoPadraoCooperativa: 5 },
  };
}

async function main() {
  console.log(`=== Reparo dedupe operacional | CNPJ ${CNPJ} ===\n`);

  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error(`Cooperativa não encontrada: ${CNPJ}`);
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchContratosSync(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);
  if (!operacional) throw new Error("operacional.json ausente na nuvem");

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));

  let data = emptyAppData();
  data.cooperativas = [coop];
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  data = { ...data, notasPedido: notas };
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);

  const rawCloud = operacional.fichaCorrida ?? [];
  const rawCoop = rawCloud.filter((f) => f.cooperativaId === coop.id);
  const dedupedRaw = dedupeFichaCorridaPorNota(rawCoop, notas);
  console.log(`Fichas na nuvem (bruto): ${rawCoop.length}`);
  console.log(`Fichas após dedupe lógico: ${dedupedRaw.length}`);
  console.log(`Duplicatas removíveis: ${rawCoop.length - dedupedRaw.length}\n`);

  const reconciled = reconciliarFichaFromNotasConferidas(data);
  const fichaCoop = dedupeFichaCorridaPorNota(
    reconciled.fichaCorrida.filter((f) => f.cooperativaId === coop.id),
    reconciled.notasPedido
  );

  console.log(`Fichas após reconciliar: ${fichaCoop.length}`);

  if (fichaCoop.length === rawCoop.length && rawCoop.length === dedupedRaw.length) {
    console.log("\nNenhuma alteração necessária na nuvem.");
    return;
  }

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: fichaCoop,
    arquivosMensais: reconciled.arquivosMensais.filter((a) => a.cooperativaId === coop.id),
  };

  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha no upload:", up.error);
    process.exit(1);
  }

  console.log(`\nUpload concluído: ${rawCoop.length} → ${fichaCoop.length} lançamentos na ficha.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
