/** Conta fichas inválidas na nuvem */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, fichaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  fichaNotaElegivelParaPagamento,
  listarFichasPendentesPagamento,
  getResumoPagamentoCooperado,
} from "../src/services/notaPedidoService";
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
const MES = "2026-08";

function fichaValida(data: AppData, f: AppData["fichaCorrida"][0]): boolean {
  const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
  if (!nota) return false;
  if (nota.status !== "conferida" && nota.status !== "pago") return false;
  if (f.status === "pago") return nota.status === "pago" || nota.status === "conferida";
  if (f.status === "pendente") return fichaNotaElegivelParaPagamento(data, f);
  return false;
}

async function main() {
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
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));
  let data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: cloudCooperados.map((c) => ({ ...c, cooperativaId: coop.id })),
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: notas,
    fichaCorrida: operacional?.fichaCorrida ?? [],
    pagamentosCooperado: operacional?.pagamentosCooperado ?? [],
    arquivosMensais: operacional?.arquivosMensais ?? [],
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
    config: operacional?.config ?? { descontoPadraoCooperativa: 5 },
  };
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);

  const invalid = data.fichaCorrida.filter((f) => !fichaValida(data, f));
  console.log("Fichas total:", data.fichaCorrida.length, "inválidas:", invalid.length);

  const byCoop = new Map<string, number>();
  for (const f of invalid) {
    const nome =
      data.cooperados.find((c) => c.id === f.cooperadoId)?.nomeCompleto ??
      f.cooperadoNomeSnapshot ??
      f.cooperadoId;
    byCoop.set(nome, (byCoop.get(nome) ?? 0) + 1);
  }
  console.log("\nInválidas por cooperado:");
  [...byCoop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([n, c]) => console.log(`  ${c}x ${n}`));

  const railandia = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("railandia"));
  if (railandia) {
    const raw = data.fichaCorrida.filter(
      (f) => f.mesReferencia === MES && fichaPertenceCooperado(data, f, railandia.id, coop.id)
    );
    const valid = listarFichasPendentesPagamento(data, railandia.id, MES, coop.id);
    const resumo = getResumoPagamentoCooperado(data, railandia.id, MES, coop.id);
    console.log(`\nRailandia raw ficha: ${raw.length} soma ${raw.reduce((s, f) => s + f.valorLiquido, 0).toFixed(2)}`);
    console.log(`Railandia válida: ${valid.length} soma ${valid.reduce((s, f) => s + f.valorLiquido, 0).toFixed(2)}`);
    console.log(`Resumo líquido: ${resumo.valorLiquido.toFixed(2)}`);
  }
}

main().catch(console.error);
