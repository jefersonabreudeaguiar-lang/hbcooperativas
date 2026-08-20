/**
 * Remove fichas inválidas da nuvem e reconcilia com notas conferidas.
 * Uso: npx tsx scripts/purgar-fichas-invalidas-cloud.ts [cnpj]
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
  fichaValidaNoExtrato,
  purgarFichasInvalidas,
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

async function loadData(): Promise<{ data: AppData; operacional: NonNullable<Awaited<ReturnType<typeof fetchOperacionalSync>>> }> {
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
  if (!operacional) throw new Error("operacional.json ausente");

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
  return { data, operacional };
}

async function main() {
  console.log(`=== Purgar fichas inválidas | CNPJ ${CNPJ} ===\n`);
  const { data, operacional } = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";

  const rawLen = operacional.fichaCorrida?.length ?? 0;
  const cleanLen = data.fichaCorrida.length;
  const rawInvalid = (operacional.fichaCorrida ?? []).filter((f) => !fichaValidaNoExtrato(data, f)).length;

  console.log(`Nuvem raw: ${rawLen} fichas (${rawInvalid} inválidas)`);
  console.log(`Após purge+reconciliar: ${cleanLen} fichas`);

  if (rawInvalid === 0 && rawLen === cleanLen) {
    console.log("\nNenhuma ficha inválida — nada a enviar.");
    return;
  }

  const removed = rawLen - cleanLen;
  console.log(`Removidas: ${removed}`);

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: data.fichaCorrida.filter((f) => f.cooperativaId === coopId),
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
  };

  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha upload:", up.error);
    process.exit(1);
  }

  console.log("\nUpload concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
