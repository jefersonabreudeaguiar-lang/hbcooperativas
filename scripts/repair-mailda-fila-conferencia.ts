/**
 * Devolve notas rejeitadas da Mailda (ou cooperado informado) para Conferir entregas.
 * Uso: npx tsx scripts/repair-mailda-fila-conferencia.ts [cnpj] [cooperadoId]
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
  notaPayloadForTable,
  uploadNotaToStorage,
  upsertNotasInTable,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, notaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { podeRelancarEntregaNota, relancarEntregaNota } from "../src/services/notaPedidoService";

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
const COOP_ARG = process.argv[3];

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
  const { data: initial, operacional } = await loadData();
  const coopId = initial.cooperativas[0]?.id ?? "";

  const alvo =
    initial.cooperados.find(
      (c) =>
        c.id === COOP_ARG ||
        (!COOP_ARG && c.nomeCompleto.toLowerCase().includes("mailda"))
    ) ?? null;

  if (!alvo) {
    console.error("Cooperado não encontrado");
    process.exit(1);
  }

  console.log(`=== Re-lançar rejeitadas → Conferir entregas | ${alvo.nomeCompleto} ===\n`);

  let data = initial;
  const rejeitadas = data.notasPedido.filter(
    (n) =>
      n.status === "rejeitada" &&
      notaPertenceCooperado(data, n, alvo.id, coopId) &&
      podeRelancarEntregaNota(data, n.id, coopId).ok
  );

  if (rejeitadas.length === 0) {
    console.log("Nenhuma nota rejeitada elegível para re-lançar.");
    return;
  }

  for (const nota of rejeitadas) {
    console.log(`Re-lançando ${nota.id} (${nota.fotosEnviadasCount ?? "?"} fotos) — ${nota.motivoRejeicao ?? ""}`);
    const result = relancarEntregaNota(data, nota.id, coopId);
    if (!result.ok) {
      console.log("  Falhou:", result.reason);
      continue;
    }
    data = result.data;
    const payload = notaPayloadForTable(result.nota);
    const table = await upsertNotasInTable(supabase, CNPJ, [payload], result.nota.cooperadoNomeSnapshot);
    if (!table.ok && !table.tableMissing) {
      console.error("  Falha tabela:", table.error);
      process.exit(1);
    }
    const storage = await uploadNotaToStorage(supabase, CNPJ, payload, result.nota.cooperadoNomeSnapshot);
    if (!storage.ok) {
      console.error("  Falha storage:", storage.error);
      process.exit(1);
    }
    console.log("  → aguardando_conferencia (nuvem atualizada)");
  }

  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: data.fichaCorrida.filter((f) => f.cooperativaId === coopId),
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
  };
  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha upload operacional:", up.error);
    process.exit(1);
  }

  const pendentes = data.notasPedido.filter(
    (n) =>
      n.status === "aguardando_conferencia" &&
      notaPertenceCooperado(data, n, alvo.id, coopId)
  );
  console.log(`\nConcluído. ${alvo.nomeCompleto.split(" ")[0]} agora tem ${pendentes.length} entrega(s) em Conferir entregas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
