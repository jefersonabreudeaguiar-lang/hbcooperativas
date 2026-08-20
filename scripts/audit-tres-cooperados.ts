/**
 * Auditoria read-only: Ivan, Cleber e Cleito — npx tsx scripts/audit-tres-cooperados.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado, NotaPedido } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
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
  getResumoPagamentoCooperado,
  getTotalAPagarCooperado,
  listarFichasPendentesPagamento,
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

const CNPJ = "62351750000165";
const ALVOS = ["ivan", "cleber", "cleito"];

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

async function loadData(): Promise<AppData> {
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
  let data = emptyAppData();
  data.cooperativas = [coop];
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coop.id);
  data = { ...data, notasPedido: notas };
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

function findCooperados(data: AppData): Cooperado[] {
  return data.cooperados.filter((c) =>
    ALVOS.some((a) => c.nomeCompleto.toLowerCase().includes(a))
  );
}

function notasDoCooperado(data: AppData, c: Cooperado, mes?: string): NotaPedido[] {
  return data.notasPedido.filter(
    (n) =>
      notaPertenceCooperado(data, n, c.id, c.cooperativaId) &&
      (!mes || n.mesReferencia === mes)
  );
}

async function main() {
  const data = await loadData();
  const coopId = data.cooperativas[0]?.id ?? "";
  const alvos = findCooperados(data);

  console.log("=== Auditoria Ivan / Cleber / Cleito (read-only) ===\n");
  console.log(`Cooperativa: CoopeagriPla (${CNPJ})\n`);

  if (alvos.length === 0) {
    console.log("Nenhum cooperado encontrado com esses nomes.");
    return;
  }

  for (const c of alvos) {
    console.log(`• ${c.nomeCompleto} | id=${c.id}`);
  }
  console.log("");

  // Notas recentes (últimos 7 dias ou status ativo)
  const notasRecentes = data.notasPedido
    .filter((n) => {
      const nome =
        n.cooperadoNomeSnapshot?.toLowerCase() ??
        data.cooperados.find((x) => x.id === n.cooperadoId)?.nomeCompleto.toLowerCase() ??
        "";
      return ALVOS.some((a) => nome.includes(a)) || alvos.some((c) => notaPertenceCooperado(data, n, c.id, coopId));
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Agrupar por nota id para divisão multi-cooperado
  const notaIds = new Set(notasRecentes.map((n) => n.id));
  const notasComDivisao = notasRecentes.filter((n) => n.divisaoEntrega && (n.divisaoEntrega.participantes?.length ?? 0) > 1);

  console.log(`Notas ligadas aos 3 (total): ${notasRecentes.length}`);
  console.log(`Notas com divisão entre participantes: ${notasComDivisao.length}\n`);

  for (const nota of notasComDivisao.slice(0, 15)) {
    const part = nota.divisaoEntrega!.participantes;
    const fichas = dedupeFichaCorridaPorNota(
      data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id),
      data.notasPedido
    );
    const somaFicha = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
    const somaPart = round2(part.reduce((s, p) => s + (p.valorLiquido ?? 0), 0));

    console.log(`--- Nota ${nota.id.slice(0, 24)} | ${nota.mesReferencia} | status=${nota.status} ---`);
    console.log(`  Valor nota: ${fmt(nota.valorLiquido)} | Soma participantes: ${fmt(somaPart)} | Soma ficha: ${fmt(somaFicha)}`);
    console.log(`  Instituição: ${nota.escolaAvulsaNome ?? nota.instituicaoId} | data=${nota.dataEntrega}`);

    for (const p of part) {
      const coop = data.cooperados.find((x) => x.id === p.cooperadoId);
      const nome = p.cooperadoNomeSnapshot ?? coop?.nomeCompleto ?? p.cooperadoId;
      const fichaCoop = fichas.filter((f) => fichaPertenceCooperado(data, f, p.cooperadoId, coopId));
      const somaF = round2(fichaCoop.reduce((s, f) => s + f.valorLiquido, 0));
      console.log(`    → ${nome}: part=${fmt(p.valorLiquido ?? 0)} ficha=${fmt(somaF)} (${fichaCoop.length} lanç.)`);
    }

    const issues: string[] = [];
    if (Math.abs(somaPart - nota.valorLiquido) > 0.02) issues.push("soma participantes ≠ nota");
    if (Math.abs(somaFicha - nota.valorLiquido) > 0.02 && nota.status === "conferida")
      issues.push("soma ficha ≠ nota");
    if (issues.length) console.log(`  ⚠ ${issues.join("; ")}`);
    console.log("");
  }

  // Totais por cooperado (todos os meses com movimento)
  console.log("=== Totais por cooperado ===\n");
  const mesesSet = new Set<string>();
  for (const c of alvos) {
    for (const n of notasDoCooperado(data, c)) mesesSet.add(n.mesReferencia);
    for (const f of data.fichaCorrida.filter((f) => fichaPertenceCooperado(data, f, c.id, coopId)))
      mesesSet.add(f.mesReferencia);
  }
  const meses = [...mesesSet].sort().reverse();

  for (const mes of meses.slice(0, 3)) {
    console.log(`Mês ${mes}:`);
    let somaNotasConferidas = 0;
    let somaLiquido = 0;
    let somaFichaValida = 0;

    for (const c of alvos) {
      const notas = notasDoCooperado(data, c, mes).filter(
        (n) => n.status === "conferida" || n.status === "pago"
      );
      const notasVal = round2(notas.reduce((s, n) => s + n.valorLiquido, 0));
      const fichaVal = round2(
        listarFichasPendentesPagamento(data, c.id, mes, coopId).reduce((s, f) => s + f.valorLiquido, 0)
      );
      const resumo = getResumoPagamentoCooperado(data, c.id, mes, coopId);
      const total = getTotalAPagarCooperado(data, c.id, mes, coopId);

      somaNotasConferidas += notasVal;
      somaLiquido += total;
      somaFichaValida += fichaVal;

      console.log(`  ${c.nomeCompleto.split(" ")[0]}:`);
      console.log(`    Notas conferidas/pagas: ${notas.length} → ${fmt(notasVal)}`);
      console.log(`    Ficha pendente válida: ${fmt(fichaVal)}`);
      console.log(`    A pagar (líquido): ${fmt(total)} (mens/descontos já aplicados)`);
      for (const n of notas) {
        const div =
          n.divisaoEntrega?.participantes.find(
            (p) =>
              resolverCooperadoIdCanonico(data, p.cooperadoId, coopId) ===
              resolverCooperadoIdCanonico(data, c.id, coopId)
          )?.valorLiquido ?? n.valorLiquido;
        console.log(
          `      - ${n.id.slice(0, 20)} status=${n.status} nota=${fmt(n.valorLiquido)} parte=${fmt(div)} ${n.dataEntrega}`
        );
      }
    }
    console.log(`  SOMA dos 3 (notas conferidas): ${fmt(somaNotasConferidas)}`);
    console.log(`  SOMA a pagar líquido: ${fmt(somaLiquido)}`);
    console.log("");
  }

  // Cleber específico — histórico aguardando_conferencia
  const cleber = alvos.find((c) => c.nomeCompleto.toLowerCase().includes("cleber"));
  if (cleber) {
    const aguard = notasDoCooperado(data, cleber).filter((n) => n.status === "aguardando_conferencia");
    if (aguard.length) {
      console.log(`Cleber — ${aguard.length} nota(s) aguardando conferência (não entram no a pagar):`);
      for (const n of aguard) {
        const ficha = data.fichaCorrida.filter((f) => f.notaPedidoId === n.id);
        console.log(`  ${n.id.slice(0, 22)} val=${fmt(n.valorLiquido)} ficha=${ficha.length} lanç. (${fmt(round2(ficha.reduce((s, f) => s + f.valorLiquido, 0)))})`);
      }
      console.log("");
    }
  }
}

main().catch(console.error);
