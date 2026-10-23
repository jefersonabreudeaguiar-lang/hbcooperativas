/**
 * O que o Início do responsável deve mostrar (mesmas funções da UI).
 * npx tsx scripts/audit-s1-inicio-ui-once.ts [cnpj]
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
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { getAdminStats } from "../src/services/dashboardService";
import { getFilaDoDia } from "../src/services/filaDoDiaService";
import {
  countCooperadosLancamentosEmAbertoResponsavel,
  countCooperadosPagamentoPendenteResponsavel,
  countNotasFilaConferenciaResponsavel,
  getRelatorioLancamentosEmAbertoResponsavel,
} from "../src/services/responsavelPainelIndex";
import { resumoLivroCaixa } from "../src/services/livroCaixaService";

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
  } as AppData;
}

async function loadData(): Promise<{ data: AppData; coopId: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
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
  data = reconciliarFichaFromNotasConferidas(data);
  return { data, coopId: coop.id };
}

async function main() {
  const { data, coopId } = await loadData();
  const mes = new Date().toISOString().slice(0, 7);
  const admin = getAdminStats(data, coopId);
  const fila = getFilaDoDia(data, coopId, mes);
  const conferir = countNotasFilaConferenciaResponsavel(data, coopId);
  const pagarCoops = countCooperadosPagamentoPendenteResponsavel(data, coopId);
  const emAbertoCount = countCooperadosLancamentosEmAbertoResponsavel(data, coopId);
  const emAbertoLinhas = getRelatorioLancamentosEmAbertoResponsavel(data, coopId);
  const livro = data.livroCaixa?.filter((l) => l.cooperativaId === coopId) ?? [];
  const resumoLivro = resumoLivroCaixa(data, coopId, mes);

  console.log(`\n=== S1 Início (UI esperada) | ${CNPJ} ===\n`);
  console.log("Cards:");
  console.log(`  A pagar aos cooperados: R$ ${admin.valoresAPagar.toFixed(2)}`);
  console.log(`  Entregas p/ conferir:   ${admin.entregasPendentes} (índice conferir: ${conferir})`);
  console.log(`  Cooperados ativos:      ${admin.cooperadosAtivos}`);
  console.log(`  Fichas pendentes (stat interno): ${admin.pagamentosPendentes}`);
  console.log(`  Cooperados prontos PIX: ${pagarCoops}`);
  console.log(`  Aba Em aberto (cooperados): ${emAbertoCount} (${emAbertoLinhas.length} linhas)`);
  console.log(
    `  Livro caixa lançamentos (coop): ${livro.length} · saldo: R$ ${resumoLivro.saldo.toFixed(2)}`
  );
  console.log("\nFila do dia:");
  if (fila.length === 0) console.log("  (vazia — mensagem 'Fila do dia limpa')");
  for (const item of fila) {
    console.log(`  - ${item.titulo}: ${item.count} → ${item.href}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
