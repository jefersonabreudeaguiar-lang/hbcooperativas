/**
 * Conferência completa Ivan — notas, somas e divisão.
 * npx tsx scripts/audit-ivan-conferencia.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido } from "../src/types";
import { round2 } from "../src/utils/calculations";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import {
  fichaPertenceCooperado,
  mergeCloudCooperadosIntoData,
  notaPertenceCooperado,
  resolverCooperadoIdCanonico,
} from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  dedupeFichaCorridaPorNota,
  divisaoFichasCobremParticipantes,
  getResumoPagamentoCooperado,
  getTotalAPagarCooperado,
  listarFichasExtratoCooperadoMes,
  listarFichasPendentesPagamento,
  fichaValidaNoExtrato,
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
const NOTA_DIV = "np_1787160875774_sem0t";

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dividirValorEntrega(total: number, index: number, count: number): number {
  if (count <= 0) return 0;
  const base = Math.floor((total * 100) / count) / 100;
  const resto = Math.round(total * 100 - base * count * 100);
  return base + (index < resto ? 0.01 : 0);
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
  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
  }));
  let data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: notas,
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
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(
    data,
    operacional ?? {
      updatedAt: "",
      arquivosMensais: [],
      pagamentosCooperado: [],
      comunicados: [],
      mensalidades: [],
      descontos: [],
      config: { descontoPadraoCooperativa: 5 },
    },
    coop.id,
    cloudCooperados
  );
  return data;
}

function linhaNota(data: AppData, ivanId: string, coopId: string, n: NotaPedido): string {
  const fichas = dedupeFichaCorridaPorNota(
    data.fichaCorrida.filter((f) => f.notaPedidoId === n.id && fichaPertenceCooperado(data, f, ivanId, coopId)),
    data.notasPedido
  );
  const somaF = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
  const div = n.divisaoEntrega?.participantes.find(
    (p) => resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) === resolverCooperadoIdCanonico(data, ivanId, coopId)
  );
  const parteEsp =
    n.divisaoEntrega && (n.divisaoEntrega.participantes.length ?? 0) > 1
      ? dividirValorEntrega(
          n.valorLiquido,
          n.divisaoEntrega.participantes.findIndex(
            (p) =>
              resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) ===
              resolverCooperadoIdCanonico(data, ivanId, coopId)
          ),
          n.divisaoEntrega.participantes.length
        )
      : n.valorLiquido;
  return `  ${n.id.slice(0, 26)} | ${n.status.padEnd(22)} | nota ${fmt(n.valorLiquido)} | parte esp ${fmt(parteEsp)} | ficha Ivan ${fmt(somaF)} (${fichas.length}) | ${n.dataEntrega}`;
}

async function main() {
  const data = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";
  const ivan = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("ivan"));
  if (!ivan) {
    console.log("Ivan não encontrado");
    return;
  }

  const cleber = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  const cleito = data.cooperados.find((c) => c.nomeCompleto.toLowerCase().includes("cleito"));

  console.log("=== Conferência Ivan Arruda de Oliveira ===\n");
  console.log(`Cooperado: ${ivan.nomeCompleto} (${ivan.id})`);
  console.log(`Mês referência: ${MES}\n`);

  const todasNotas = data.notasPedido
    .filter((n) => notaPertenceCooperado(data, n, ivan.id, coopId))
    .sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega));

  console.log(`--- Todas as notas ligadas a Ivan (${todasNotas.length}) ---`);
  for (const n of todasNotas) {
    console.log(linhaNota(data, ivan.id, coopId, n));
  }

  const conferidas = todasNotas.filter((n) => n.status === "conferida" || n.status === "pago");
  const pendentes = todasNotas.filter((n) => n.status === "aguardando_conferencia" || n.status === "rejeitada");

  console.log(`\n--- Soma notas conferidas/pagas (valor integral da nota) ---`);
  const somaNotasIntegral = round2(conferidas.reduce((s, n) => s + n.valorLiquido, 0));
  console.log(`  ${conferidas.length} nota(s) → ${fmt(somaNotasIntegral)} (não usar como a pagar se houver divisão)`);

  console.log(`\n--- Ficha válida Ivan (${MES}) ---`);
  const fichaPend = listarFichasPendentesPagamento(data, ivan.id, MES, coopId);
  const fichaExtrato = listarFichasExtratoCooperadoMes(data, ivan.id, MES, coopId);
  const somaFicha = round2(fichaPend.reduce((s, f) => s + f.valorLiquido, 0));
  console.log(`  Pendentes pagamento: ${fichaPend.length} → ${fmt(somaFicha)}`);
  for (const f of fichaPend) {
    console.log(`    ${f.notaPedidoId.slice(0, 26)} | ${fmt(f.valorLiquido)} | ${f.descricao?.slice(0, 50)}`);
  }

  const resumo = getResumoPagamentoCooperado(data, ivan.id, MES, coopId);
  const total = getTotalAPagarCooperado(data, ivan.id, MES, coopId);
  console.log(`\n--- Resumo a pagar (app cooperado = painel) ---`);
  console.log(`  Entregas (bruto ficha): ${fmt(resumo.valorEntregas)}`);
  console.log(`  Mensalidade/descontos: ${fmt(resumo.valorEntregas - resumo.valorLiquido)}`);
  console.log(`  Líquido a receber: ${fmt(resumo.valorLiquido)}`);
  console.log(`  getTotalAPagarCooperado: ${fmt(total)}`);
  console.log(resumo.valorLiquido === total ? "  ✓ Totais alinhados" : "  ⚠ Divergência interna");

  const invalidas = data.fichaCorrida.filter(
    (f) =>
      fichaPertenceCooperado(data, f, ivan.id, coopId) &&
      f.mesReferencia === MES &&
      !fichaValidaNoExtrato(data, f)
  );
  if (invalidas.length) {
    console.log(`\n⚠ ${invalidas.length} ficha(s) inválida(s) ainda no extrato raw:`);
    for (const f of invalidas) {
      const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
      console.log(`    ${f.notaPedidoId.slice(0, 24)} | ${fmt(f.valorLiquido)} | nota status=${nota?.status ?? "AUSENTE"}`);
    }
  } else {
    console.log("\n✓ Nenhuma ficha inválida para Ivan neste mês");
  }

  const notaDiv = data.notasPedido.find((n) => n.id === NOTA_DIV);
  if (notaDiv?.divisaoEntrega) {
    console.log(`\n=== Divisão nota ${NOTA_DIV.slice(0, 22)}… ===`);
    console.log(`  Valor nota: ${fmt(notaDiv.valorLiquido)} | status: ${notaDiv.status}`);
    console.log(`  Participantes: ${notaDiv.divisaoEntrega.participantes.length}`);
    const N = notaDiv.divisaoEntrega.participantes.length;
    let somaPartes = 0;
    let somaFichasDiv = 0;

    for (let i = 0; i < N; i++) {
      const p = notaDiv.divisaoEntrega.participantes[i];
      const esperado = dividirValorEntrega(notaDiv.valorLiquido, i, N);
      somaPartes += esperado;
      const fichasP = dedupeFichaCorridaPorNota(
        data.fichaCorrida.filter((f) => f.notaPedidoId === notaDiv.id && fichaPertenceCooperado(data, f, p.cooperadoId, coopId)),
        data.notasPedido
      );
      const somaF = round2(fichasP.reduce((s, f) => s + f.valorLiquido, 0));
      somaFichasDiv += somaF;
      const okF = Math.abs(somaF - esperado) < 0.02;
      const resumoP = getResumoPagamentoCooperado(data, p.cooperadoId, MES, coopId);
      console.log(
        `  → ${p.cooperadoNome}: esperado ${fmt(esperado)} | ficha ${fmt(somaF)} ${okF ? "✓" : "⚠"} | líquido ${fmt(resumoP.valorLiquido)}`
      );
    }

    const cobertura = divisaoFichasCobremParticipantes(data, dedupeFichaCorridaPorNota(
      data.fichaCorrida.filter((f) => f.notaPedidoId === notaDiv.id),
      data.notasPedido
    ), notaDiv);

    console.log(`\n  Soma partes esperadas: ${fmt(round2(somaPartes))} (nota ${fmt(notaDiv.valorLiquido)}) ${Math.abs(round2(somaPartes) - notaDiv.valorLiquido) < 0.02 ? "✓" : "⚠"}`);
    console.log(`  Soma fichas 3 cooperados: ${fmt(round2(somaFichasDiv))} ${Math.abs(round2(somaFichasDiv) - notaDiv.valorLiquido) < 0.02 ? "✓" : "⚠"}`);
    console.log(`  Todos com ficha: ${cobertura ? "✓ sim" : "⚠ não"}`);

    if (cleber && cleito) {
      const t3 =
        getTotalAPagarCooperado(data, ivan.id, MES, coopId) +
        getTotalAPagarCooperado(data, cleber.id, MES, coopId) +
        getTotalAPagarCooperado(data, cleito.id, MES, coopId);
      const liquidoEsp = round2(notaDiv.valorLiquido - 30 * 3);
      console.log(`\n  Soma líquida Ivan+Cleber+Cleito (só esta nota ~${fmt(liquidoEsp)}): ${fmt(round2(t3))}`);
      console.log(`  (inclui mensalidade R$ 30 de cada um)`);
    }
  }

  console.log("\n--- Conclusão ---");
  const okIvan =
    Math.abs(somaFicha - resumo.valorEntregas) < 0.02 &&
    invalidas.length === 0 &&
    resumo.valorLiquido === total;
  console.log(okIvan ? "✓ Ivan: somas e ficha coerentes para o app." : "⚠ Ivan: revisar itens marcados acima.");
}

main().catch(console.error);
