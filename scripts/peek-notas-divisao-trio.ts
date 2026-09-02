/**
 * Detalhe das notas problemáticas Ivan/Cleito/Cleber
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { round2 } from "../src/utils/calculations";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fichaPertenceCooperado, mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { dedupeFichaCorridaPorNota } from "../src/services/notaPedidoService";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";

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

const CNPJ = "62351750000165";
const NOTAS = ["np_1787660350108_srkra", "np_1788284688150_g7ubo"];

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function loadData(): Promise<AppData> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  const coop = cooperativaFromCloudRow(rows![0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchContratosSync(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({ ...n, cooperativaId: n.cooperativaId ?? coop.id }));
  let data: AppData = {
    cooperativas: [coop], users: [], cooperados: [], mensalidades: [], cotas: [], instituicoes: [], produtosInstituicao: [],
    notasPedido: notas, fichaCorrida: [], pagamentosCooperado: [], arquivosMensais: [], ajustesFichaMes: [], entregas: [],
    descontos: [], valoresAvulsosReceber: [], pagamentos: [], financeiro: [], comunicados: [], reclamacoes: [],
    votacaoPautas: [], votacaoVotos: [], propriedades: [], veiculos: [], fechamentos: [], livroCaixa: [],
    prestacoesContas: [], auditLog: [], config: { descontoPadraoCooperativa: 5 },
  };
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional ?? { updatedAt: "", arquivosMensais: [], pagamentosCooperado: [], comunicados: [], mensalidades: [], descontos: [], config: { descontoPadraoCooperativa: 5 } }, coop.id, cloudCooperados);
  return data;
}

async function main() {
  const data = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";

  for (const id of NOTAS) {
    const nota = data.notasPedido.find((n) => n.id === id);
    if (!nota) {
      console.log(`Nota ${id} não encontrada\n`);
      continue;
    }
    console.log(`\n======== ${id} ========`);
    console.log(`cooperado: ${nota.cooperadoNomeSnapshot} (${nota.cooperadoId})`);
    console.log(`mes: ${nota.mesReferencia} | data: ${nota.dataEntrega} | status: ${nota.status}`);
    console.log(`valorLiquido: ${fmt(nota.valorLiquido)} | bruto: ${fmt(nota.valorBruto ?? 0)}`);
    console.log(`fotos: ${nota.fotos?.length ?? 0} | itens: ${nota.itens?.length ?? 0}`);
    console.log(`divisaoEntrega:`, JSON.stringify(nota.divisaoEntrega ?? null, null, 2));
    console.log(`fotos enviadas: ${nota.fotos?.filter((f) => f?.url)?.length ?? 0}`);

    const fichas = dedupeFichaCorridaPorNota(data.fichaCorrida.filter((f) => f.notaPedidoId === id), data.notasPedido);
    console.log(`\nFichas (${fichas.length}):`);
    const byCoop = new Map<string, number>();
    for (const f of fichas) {
      const cid = resolverCooperadoIdCanonico(data, f.cooperadoId, coopId);
      const nome = data.cooperados.find((c) => c.id === cid)?.nomeCompleto ?? f.cooperadoId;
      byCoop.set(nome, round2((byCoop.get(nome) ?? 0) + f.valorLiquido));
      console.log(`  ${nome.slice(0, 30).padEnd(30)} | ${fmt(f.valorLiquido)} | ${f.descricao?.slice(0, 40)} | div=${Boolean(f.divisaoEntrega)}`);
    }
    console.log("\nSoma por cooperado:");
    for (const [nome, v] of byCoop) console.log(`  ${nome}: ${fmt(v)}`);
    console.log(`  TOTAL: ${fmt(round2([...byCoop.values()].reduce((s, v) => s + v, 0)))}`);
  }
}

main().catch(console.error);
