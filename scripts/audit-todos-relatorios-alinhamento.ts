/**
 * Auditoria cruzada: itens/valores das notas × responsável × contador × cooperado.
 * Uso: npx tsx scripts/audit-todos-relatorios-alinhamento.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { AppData, Cooperado } from "../src/types";
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
import { fichaPertenceCooperado, mergeCloudCooperadosIntoData, notaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  agregarItensFichaMes,
  agregarItensNotasCooperado,
  calcularItensNota,
  fichasValoresAlinhadosComNota,
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  getResumoValorAPagarRelatorio,
  getTotalAPagarCooperado,
  getValorExibicaoCooperado,
  buildValorExibicaoCooperadoOpts,
  reconciliarFichaFromNotasConferidas,
  somaValorBrutoFichasNota,
} from "../src/services/notaPedidoService";
import {
  calcularConciliacaoMensal,
  listMesesConciliacao,
} from "../src/services/conciliacaoMensalService";
import {
  calcularFechamentoMensalLive,
  getRelatorioEntregasPorItensPeriodo,
  getRelatorioPagarCooperadoEmAberto,
  getTotalValoresAPagarEmAberto,
} from "../src/services/relatorioService";
import {
  getMapaReceitasContrato,
  getRazaoAnaliticoTodosCooperados,
} from "../src/services/contadorRelatorioService";
import {
  cooperadoExibirValorReceberInicio,
  getValorQuantoVouReceber,
  listarMesesPendentesQuantoVouReceber,
} from "../src/services/cooperadoEntregasService";
import { getAdminStats } from "../src/services/dashboardService";

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

const TOL = 0.02;
const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");

function near(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) <= TOL;
}

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

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
  data = reconciliarFichaFromNotasConferidas(data);
  return { data, coopId: coop.id, coopNome: coop.nome };
}

type Issue = { tipo: string; severidade: "critico" | "aviso"; detalhe: string };

function auditItensNotas(data: AppData): Issue[] {
  const issues: Issue[] = [];
  for (const nota of data.notasPedido) {
    if (nota.status === "rascunho" || nota.status === "rejeitada") continue;
    const calc = calcularItensNota(nota.itens ?? [], nota.percentualDescontoCooperativa ?? 0);
    if ((nota.itens ?? []).length === 0) {
      issues.push({
        tipo: "nota_sem_itens",
        severidade: "critico",
        detalhe: `${nota.cooperadoNomeSnapshot ?? nota.cooperadoId} | ${nota.mesReferencia} | ${nota.id.slice(0, 16)}`,
      });
      continue;
    }
    if (!near(nota.valorBruto, calc.valorBruto)) {
      issues.push({
        tipo: "nota_bruto_vs_itens",
        severidade: "critico",
        detalhe: `${nota.cooperadoNomeSnapshot} | ${nota.mesReferencia}: nota ${fmt(nota.valorBruto)} ≠ itens ${fmt(calc.valorBruto)}`,
      });
    }
    if (!near(nota.valorLiquido, calc.valorLiquido)) {
      issues.push({
        tipo: "nota_liquido_vs_itens",
        severidade: "critico",
        detalhe: `${nota.cooperadoNomeSnapshot} | ${nota.mesReferencia}: líquido ${fmt(nota.valorLiquido)} ≠ calc ${fmt(calc.valorLiquido)}`,
      });
    }
    for (const item of nota.itens ?? []) {
      if ((item.quantidade ?? 0) <= 0) continue;
      const esperado = round2((item.quantidade ?? 0) * (item.precoUnitario ?? 0));
      if (!near(item.valorBruto ?? 0, esperado)) {
        issues.push({
          tipo: "item_qtd_preco",
          severidade: "critico",
          detalhe: `${nota.id.slice(0, 12)} | ${item.produtoNome}: ${item.quantidade}×${item.precoUnitario} ≠ ${item.valorBruto}`,
        });
      }
    }
  }
  return issues;
}

function auditNotaFicha(data: AppData): Issue[] {
  const issues: Issue[] = [];
  const notasOk = data.notasPedido.filter((n) => n.status === "conferida" || n.status === "pago");
  for (const nota of notasOk) {
    if (!fichasValoresAlinhadosComNota(data.fichaCorrida, nota)) {
      issues.push({
        tipo: "nota_ficha_bruto",
        severidade: "critico",
        detalhe: `${nota.cooperadoNomeSnapshot} | ${nota.mesReferencia}: nota ${fmt(nota.valorBruto)} vs ficha ${fmt(somaValorBrutoFichasNota(data.fichaCorrida, nota.id))}`,
      });
    }
  }
  return issues;
}

function auditCooperadoMes(data: AppData, c: Cooperado, mes: string, coopId: string): Issue[] {
  const issues: Issue[] = [];
  const temAtividade =
    data.notasPedido.some(
      (n) =>
        n.mesReferencia === mes &&
        notaPertenceCooperado(data, n, c.id, coopId) &&
        (n.status === "conferida" || n.status === "pago" || n.status === "aguardando_conferencia")
    ) ||
    data.fichaCorrida.some(
      (f) => f.mesReferencia === mes && fichaPertenceCooperado(data, f, c.id, coopId)
    );
  if (!temAtividade) return issues;

  const aPagar = getTotalAPagarCooperado(data, c.id, mes, coopId);
  const relatorio = getResumoValorAPagarRelatorio(data, c.id, mes, coopId).valorLiquido;
  const resumo = getResumoPagamentoCooperado(data, c.id, mes, coopId).valorLiquido;
  const exibicao = getValorExibicaoCooperado(
    getResumoPagamentoExibicao(data, c.id, mes, coopId),
    buildValorExibicaoCooperadoOpts(data, c.id, mes, coopId)
  );

  if (!near(aPagar, relatorio)) {
    issues.push({
      tipo: "cooperado_total_vs_relatorio",
      severidade: "critico",
      detalhe: `${c.nomeCompleto.split(" ")[0]} | ${mes}: getTotalAPagar ${fmt(aPagar)} ≠ relatório ${fmt(relatorio)}`,
    });
  }
  if (!near(resumo, relatorio) && aPagar > TOL) {
    issues.push({
      tipo: "cooperado_resumo_vs_relatorio",
      severidade: "aviso",
      detalhe: `${c.nomeCompleto.split(" ")[0]} | ${mes}: resumo base ${fmt(resumo)} vs relatório ${fmt(relatorio)} (Conta Coop/mensalidade)`,
    });
  }

  const itensFicha = agregarItensFichaMes(data, c.id, mes, coopId);
  const itensNotas = agregarItensNotasCooperado(data, c.id, mes, coopId);
  if (itensFicha.totalQuantidade > 0 && itensNotas.totalQuantidade > 0) {
    if (!near(itensFicha.totalBruto, itensNotas.totalBruto)) {
      issues.push({
        tipo: "itens_ficha_vs_notas",
        severidade: "aviso",
        detalhe: `${c.nomeCompleto.split(" ")[0]} | ${mes}: ficha itens ${fmt(itensFicha.totalBruto)} vs notas itens ${fmt(itensNotas.totalBruto)}`,
      });
    }
  }

  void exibicao;
  return issues;
}

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`AUDITORIA CRUZADA — NOTAS × RELATÓRIOS × CONTADOR × COOPERADO`);
  console.log(`CNPJ: ${CNPJ}`);
  console.log(`${"=".repeat(72)}\n`);

  const { data, coopId, coopNome } = await loadData();
  const cooperados = data.cooperados.filter((c) => c.cooperativaId === coopId);
  const meses = listMesesConciliacao(data);

  console.log(`Cooperativa: ${coopNome}`);
  console.log(`Notas: ${data.notasPedido.length} | Fichas: ${data.fichaCorrida.length} | Cooperados: ${cooperados.length}`);

  const allIssues: Issue[] = [];

  // 1) Itens das notas
  const itensIssues = auditItensNotas(data);
  allIssues.push(...itensIssues);
  console.log(`\n--- 1. Itens e valores das notas ---`);
  console.log(
    itensIssues.length === 0
      ? `✓ ${data.notasPedido.filter((n) => n.status !== "rascunho" && n.status !== "rejeitada").length} notas com itens coerentes`
      : `⚠ ${itensIssues.length} problema(s) em itens/valores`
  );
  for (const i of itensIssues.slice(0, 8)) console.log(`  • [${i.tipo}] ${i.detalhe}`);

  // 2) Nota × ficha
  const nfIssues = auditNotaFicha(data);
  allIssues.push(...nfIssues);
  console.log(`\n--- 2. Nota × Ficha (bruto) ---`);
  console.log(nfIssues.length === 0 ? "✓ Alinhado" : `⚠ ${nfIssues.length} desalinhamento(s)`);
  for (const i of nfIssues.slice(0, 5)) console.log(`  • ${i.detalhe}`);

  // 3) Conciliação mensal (contador + responsável)
  console.log(`\n--- 3. Conciliação mensal (contador/responsável) ---`);
  let mesesOk = 0;
  for (const mes of meses) {
    const conc = calcularConciliacaoMensal(data, mes, coopId);
    const fechamento = calcularFechamentoMensalLive(mes, data);
    const brutoNotas = round2(
      data.notasPedido
        .filter((n) => n.mesReferencia === mes && (n.status === "conferida" || n.status === "pago"))
        .reduce((s, n) => s + n.valorBruto, 0)
    );
    const linhaEF = conc.linhas.find((l) => l.id === "entregas_ficha");
    const ok =
      conc.resumo.divergencias === 0 &&
      conc.kpis.notasSemFicha === 0 &&
      near(fechamento.totalVendas ?? 0, brutoNotas);
    if (ok) mesesOk++;
    else {
      allIssues.push({
        tipo: "conciliacao_mes",
        severidade: "critico",
        detalhe: `${mes}: divergências ${conc.resumo.divergencias}, sem ficha ${conc.kpis.notasSemFicha}, fechamento Δ ${fmt(round2((fechamento.totalVendas ?? 0) - brutoNotas))}`,
      });
    }
    const flag = ok ? "✓" : "⚠";
    console.log(`${flag} ${mes} | divergências ${conc.resumo.divergencias} | sem ficha ${conc.kpis.notasSemFicha} | entregas×ficha Δ ${fmt(linhaEF?.diferenca ?? 0)}`);
  }

  // 4) Totais responsável
  const admin = getAdminStats(data);
  const totalAPagar = round2(
    cooperados.reduce((s, c) => s + getTotalAPagarCooperado(data, c.id, undefined, coopId), 0)
  );
  const relAberto = getTotalValoresAPagarEmAberto(data, coopId);
  const relLinhas = getRelatorioPagarCooperadoEmAberto(data, coopId);
  const somaRelAberto = round2(relLinhas.reduce((s, l) => s + l.total, 0));

  console.log(`\n--- 4. Totais responsável (painel + relatórios) ---`);
  console.log(`Painel "A pagar": ${fmt(admin.valoresAPagar)}`);
  console.log(`Soma getTotalAPagarCooperado: ${fmt(totalAPagar)}`);
  console.log(`Relatório em aberto (função): ${fmt(relAberto)}`);
  console.log(`Relatório em aberto (linhas): ${fmt(somaRelAberto)}`);

  if (!near(totalAPagar, admin.valoresAPagar)) {
    allIssues.push({
      tipo: "admin_vs_total_apagar",
      severidade: "aviso",
      detalhe: `Painel ${fmt(admin.valoresAPagar)} vs soma líquida ${fmt(totalAPagar)} — esperado se houver mensalidade/Conta Coop`,
    });
    console.log(`⚠ Painel vs soma líquida: Δ ${fmt(round2(admin.valoresAPagar - totalAPagar))} (mensalidade/descontos)`);
  } else {
    console.log("✓ Painel = soma getTotalAPagarCooperado");
  }
  if (!near(relAberto, somaRelAberto)) {
    allIssues.push({
      tipo: "relatorio_aberto",
      severidade: "critico",
      detalhe: `Total função ${fmt(relAberto)} ≠ soma linhas ${fmt(somaRelAberto)}`,
    });
    console.log(`⚠ Relatório em aberto inconsistente`);
  } else {
    console.log("✓ Relatório em aberto: total = soma linhas");
  }

  // 5) Contador
  console.log(`\n--- 5. Contador (mapa receitas × notas) ---`);
  for (const mes of meses.slice(-4)) {
    const mapa = getMapaReceitasContrato(data, mes, coopId);
    const brutoNotas = round2(
      data.notasPedido
        .filter((n) => n.mesReferencia === mes && (n.status === "conferida" || n.status === "pago"))
        .reduce((s, n) => s + n.valorBruto, 0)
    );
    const ok = near(mapa.totalBruto, brutoNotas);
    if (!ok) {
      allIssues.push({
        tipo: "contador_mapa_vs_notas",
        severidade: "critico",
        detalhe: `${mes}: mapa ${fmt(mapa.totalBruto)} vs notas ${fmt(brutoNotas)}`,
      });
    }
    console.log(`${ok ? "✓" : "⚠"} ${mes} | mapa receitas ${fmt(mapa.totalBruto)} vs notas ${fmt(brutoNotas)}`);
  }

  const razao = getRazaoAnaliticoTodosCooperados(data, meses[meses.length - 1] ?? "", coopId);
  console.log(`Razão analítico (último mês): ${razao.length} cooperado(s) com lançamentos`);

  // 6) Cooperado app (valor a receber)
  console.log(`\n--- 6. App cooperado (valor a receber vs relatório) ---`);
  let coopDiverg = 0;
  for (const c of cooperados) {
    const valorApp = getValorQuantoVouReceber(data, c.id, coopId).valor;
    const exibir = cooperadoExibirValorReceberInicio(data, c.id, coopId);
    const totalPend = getTotalAPagarCooperado(data, c.id, undefined, coopId);
    if (valorApp > TOL && !near(valorApp, totalPend) && exibir.exibir) {
      const mesesPend = listarMesesPendentesQuantoVouReceber(data, c.id, coopId);
      if (mesesPend.length <= 1) {
        coopDiverg++;
        allIssues.push({
          tipo: "cooperado_app_vs_total",
          severidade: "aviso",
          detalhe: `${c.nomeCompleto.split(" ")[0]}: app ${fmt(valorApp)} vs total pendente ${fmt(totalPend)}`,
        });
      }
    }
  }
  console.log(
    coopDiverg === 0
      ? "✓ Valor exibido no app coerente com total pendente (meses consolidados OK)"
      : `⚠ ${coopDiverg} cooperado(s) com diferença app vs total`
  );

  // 7) Por cooperado/mês (amostra divergências)
  console.log(`\n--- 7. Cruzamento por cooperado/mês ---`);
  let coopMesIssues = 0;
  for (const c of cooperados) {
    for (const mes of meses) {
      const issues = auditCooperadoMes(data, c, mes, coopId);
      if (issues.length) {
        coopMesIssues += issues.length;
        allIssues.push(...issues);
      }
    }
  }
  const criticosCoop = allIssues.filter((i) => i.tipo.startsWith("cooperado_") && i.severidade === "critico");
  console.log(
    criticosCoop.length === 0
      ? `✓ getTotalAPagar = getResumoValorAPagarRelatorio em todos os meses`
      : `⚠ ${criticosCoop.length} divergência(s) cooperado/mês`
  );
  for (const i of criticosCoop.slice(0, 5)) console.log(`  • ${i.detalhe}`);

  // 8) Entregas por itens (relatório)
  console.log(`\n--- 8. Relatório entregas por itens ---`);
  if (meses.length) {
    const ultimoMes = meses[meses.length - 1];
    const instIds = [...new Set(data.notasPedido.map((n) => n.instituicaoId).filter(Boolean))];
    for (const instId of instIds.slice(0, 3)) {
      const inst = data.instituicoes.find((i) => i.id === instId);
      const relItens = getRelatorioEntregasPorItensPeriodo(instId, [ultimoMes], data, coopId, {
        apenasPendente: true,
      });
      console.log(
        `${ultimoMes} | ${inst?.nome ?? instId}: ${relItens.linhas?.length ?? 0} linha(s) | bruto ${fmt(relItens.totalBruto ?? 0)} | qtd ${relItens.totalQuantidade ?? 0}`
      );
    }
  }

  const criticos = allIssues.filter((i) => i.severidade === "critico");
  const avisos = allIssues.filter((i) => i.severidade === "aviso");
  const tudoOk = criticos.length === 0 && mesesOk === meses.length && nfIssues.length === 0 && itensIssues.length === 0;

  console.log(`\n${"=".repeat(72)}`);
  console.log("RESUMO FINAL");
  console.log(`${"=".repeat(72)}`);
  console.log(`Meses OK na conciliação: ${mesesOk}/${meses.length}`);
  console.log(`Problemas críticos: ${criticos.length}`);
  console.log(`Avisos (esperados/diferença de base): ${avisos.length}`);
  console.log(
    tudoOk
      ? "\n✅ CONCLUSÃO: Quantidades e valores alinhados entre notas, fichas, relatórios do responsável, contador e app cooperado."
      : "\n⚠ CONCLUSÃO: Há divergências — ver detalhes acima."
  );

  const outDir = join(resolve(process.cwd(), "backups", "auditoria"));
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `audit-todos-relatorios-${CNPJ}-${Date.now()}.json`);
  const report = {
    geradoEm: new Date().toISOString(),
    cnpj: CNPJ,
    coopNome,
    tudoOk,
    totais: {
      notas: data.notasPedido.length,
      fichas: data.fichaCorrida.length,
      cooperados: cooperados.length,
      adminAPagar: admin.valoresAPagar,
      somaTotalAPagar: totalAPagar,
      relatorioAberto: relAberto,
      mesesOk,
      mesesTotal: meses.length,
    },
    criticos,
    avisos,
    issues: allIssues,
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSON: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
