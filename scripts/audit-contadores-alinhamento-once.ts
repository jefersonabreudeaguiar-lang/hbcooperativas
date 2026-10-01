/**
 * Auditoria rápida: painel × relatório em aberto × contador (mapa receitas).
 * Uso: npx tsx scripts/audit-contadores-alinhamento-once.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { round2 } from "../src/utils/calculations";
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
import { reconciliarFichaFromNotasConferidas, getTotalAPagarCooperado } from "../src/services/notaPedidoService";
import { getAdminStats } from "../src/services/dashboardService";
import {
  getRelatorioPagarCooperadoEmAberto,
  getTotalValoresAPagarEmAberto,
} from "../src/services/relatorioService";
import { getMapaReceitasContrato } from "../src/services/contadorRelatorioService";
import { listMesesConciliacao } from "../src/services/conciliacaoMensalService";
import { countCooperadosLancamentosEmAbertoResponsavel } from "../src/services/responsavelPainelIndex";

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
const TOL = 0.02;

function near(a: number, b: number) {
  return Math.abs(round2(a) - round2(b)) <= TOL;
}

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
  const cooperados = data.cooperados.filter((c) => c.cooperativaId === coopId && c.status === "ativo");

  const admin = getAdminStats(data, coopId);
  const totalCoop = round2(
    cooperados.reduce((s, c) => s + getTotalAPagarCooperado(data, c.id, undefined, coopId), 0)
  );
  const relTotal = getTotalValoresAPagarEmAberto(data, coopId);
  const linhas = getRelatorioPagarCooperadoEmAberto(data, coopId);
  const somaLinhas = round2(linhas.reduce((s, l) => s + l.total, 0));
  const somaPorMes = round2(linhas.reduce((s, l) => s + l.porMes.reduce((m, p) => m + p.total, 0), 0));
  const coopAberto = countCooperadosLancamentosEmAbertoResponsavel(data, coopId);

  console.log(`\n=== Contadores × relatórios | ${CNPJ} ===\n`);
  console.log(`Painel "A pagar":           R$ ${admin.valoresAPagar.toFixed(2)}`);
  console.log(`getTotalValoresAPagarEmAberto: R$ ${relTotal.toFixed(2)}`);
  console.log(`Soma getTotalAPagar (coop): R$ ${totalCoop.toFixed(2)}`);
  console.log(`Relatório em aberto (linhas): R$ ${somaLinhas.toFixed(2)} (${linhas.length} cooperados)`);
  console.log(`Soma porMes nas linhas:     R$ ${somaPorMes.toFixed(2)}`);
  console.log(`Aba Em aberto (count):      ${coopAberto} cooperados`);
  console.log(`Fichas pendentes (painel):  ${admin.pagamentosPendentes}`);
  console.log(`Entregas pendentes fila:    ${admin.entregasPendentes}`);

  const okPainel = near(admin.valoresAPagar, relTotal) && near(relTotal, totalCoop) && near(somaLinhas, relTotal);
  console.log(okPainel ? "\n✓ Valores a pagar alinhados (painel = relatório = soma cooperados)" : "\n⚠ Divergência nos totais a pagar");

  const meses = listMesesConciliacao(data).slice(-3);
  console.log("\n--- Contador (mapa receitas × notas conferidas) ---");
  for (const mes of meses) {
    const mapa = getMapaReceitasContrato(data, mes, coopId);
    const brutoNotas = round2(
      data.notasPedido
        .filter((n) => n.mesReferencia === mes && (n.status === "conferida" || n.status === "pago"))
        .reduce((s, n) => s + n.valorBruto, 0)
    );
    console.log(`${near(mapa.totalBruto, brutoNotas) ? "✓" : "⚠"} ${mes} mapa R$ ${mapa.totalBruto.toFixed(2)} vs notas R$ ${brutoNotas.toFixed(2)}`);
  }

  process.exit(okPainel ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
