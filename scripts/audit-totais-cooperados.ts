/**
 * Auditoria read-only dos totais por cooperado (nuvem Supabase).
 * Executar: npx tsx scripts/audit-totais-cooperados.ts
 * Opcional: npx tsx scripts/audit-totais-cooperados.ts 62351750000165
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, Cooperado, Cooperativa, NotaPedido, FichaCorrida } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { round2 } from "../src/utils/calculations";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  type OperacionalSyncPayload,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import {
  mergeContratosIntoData,
  mergeOperacionalIntoData,
} from "../src/services/cooperativaSyncCloudService";
import {
  dedupeFichaCorridaPorNota,
  getResumoPagamentoCooperado,
  getTotalAPagarCooperado,
  listarFichasPendentesPagamento,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { fichaPertenceCooperado, notaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { getAdminStats } from "../src/services/dashboardService";
import { calcularFechamentoMensalLive } from "../src/services/relatorioService";
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
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const TOL = 0.02;
const filterCnpj = process.argv[2] ? normalizeCnpj(process.argv[2]) : null;

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

function fmt(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesesAtivos(data: AppData, coopId: string): string[] {
  const set = new Set<string>();
  for (const n of data.notasPedido) {
    if (n.cooperativaId === coopId || data.cooperados.some((c) => c.cooperativaId === coopId)) {
      set.add(n.mesReferencia);
    }
  }
  for (const f of data.fichaCorrida) {
    if (f.cooperativaId === coopId) set.add(f.mesReferencia);
  }
  return [...set].sort();
}

function somaNotasCooperadoMes(
  data: AppData,
  cooperado: Cooperado,
  mes: string,
  strictId: boolean
): number {
  const notas = data.notasPedido.filter(
    (n) =>
      n.mesReferencia === mes &&
      (n.status === "conferida" || n.status === "pago") &&
      n.cooperativaId === cooperado.cooperativaId
  );
  const filtradas = strictId
    ? notas.filter((n) => n.cooperadoId === cooperado.id)
    : notas.filter((n) => notaPertenceCooperado(data, n, cooperado.id, cooperado.cooperativaId));
  return round2(filtradas.reduce((s, n) => s + n.valorLiquido, 0));
}

function somaFichaPendenteMes(data: AppData, cooperado: Cooperado, mes: string): number {
  return round2(
    listarFichasPendentesPagamento(data, cooperado.id, mes, cooperado.cooperativaId).reduce(
      (s, f) => s + f.valorLiquido,
      0
    )
  );
}

function findFichaDuplicates(data: AppData): { notaId: string; count: number; valores: number[] }[] {
  const byNota = new Map<string, FichaCorrida[]>();
  for (const f of data.fichaCorrida) {
    const list = byNota.get(f.notaPedidoId) ?? [];
    list.push(f);
    byNota.set(f.notaPedidoId, list);
  }
  const dupes: { notaId: string; count: number; valores: number[] }[] = [];
  for (const [notaId, list] of byNota) {
    const deduped = dedupeFichaCorridaPorNota(list, data.notasPedido);
    if (list.length > deduped.length || list.length > 1) {
      dupes.push({
        notaId,
        count: list.length,
        valores: list.map((f) => f.valorLiquido),
      });
    }
  }
  return dupes;
}

function notasSemFicha(data: AppData): NotaPedido[] {
  const fichaNotaIds = new Set(data.fichaCorrida.map((f) => f.notaPedidoId));
  return data.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      n.valorLiquido > 0.001 &&
      !fichaNotaIds.has(n.id)
  );
}

function fichasValorDivergeNota(data: AppData): { notaId: string; notaVal: number; fichaVal: number }[] {
  const out: { notaId: string; notaVal: number; fichaVal: number }[] = [];
  const byNota = new Map<string, FichaCorrida[]>();
  for (const f of data.fichaCorrida) {
    const list = byNota.get(f.notaPedidoId) ?? [];
    list.push(f);
    byNota.set(f.notaPedidoId, list);
  }
  for (const nota of data.notasPedido) {
    if (nota.status !== "conferida" && nota.status !== "pago") continue;
    const fichas = dedupeFichaCorridaPorNota(byNota.get(nota.id) ?? [], data.notasPedido);
    if (fichas.length === 0) continue;
    const soma = round2(fichas.reduce((s, f) => s + f.valorLiquido, 0));
    if (Math.abs(soma - nota.valorLiquido) > TOL) {
      out.push({ notaId: nota.id, notaVal: nota.valorLiquido, fichaVal: soma });
    }
  }
  return out;
}

async function loadCooperativas(): Promise<Cooperativa[]> {
  const { data, error } = await supabase.from("cooperativas").select("*");
  if (error || !data?.length) return [];
  return data.map((row) => {
    const coop = cooperativaFromCloudRow(row as Record<string, unknown>);
    return { ...coop, cnpj: normalizeCnpj(coop.cnpj) };
  });
}

async function buildDataForCoop(coop: Cooperativa): Promise<AppData | null> {
  const cnpj = normalizeCnpj(coop.cnpj);
  if (cnpj.length !== 14) return null;

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, cnpj),
    fetchNotasFromStorage(supabase, cnpj),
    fetchNotasFromTable(supabase, cnpj),
    fetchContratosSync(supabase, cnpj),
    fetchOperacionalSync(supabase, cnpj),
  ]);

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
    ...n,
    cooperativaId: n.cooperativaId ?? coop.id,
    cooperativaCnpj: n.cooperativaCnpj ?? cnpj,
  }));

  let data = emptyAppData();
  data.cooperativas = [coop];

  data = mergeCloudCooperadosIntoData(data, cloudCooperados, cnpj, coop.id);
  data = { ...data, notasPedido: notas };

  if (contratos) {
    data = mergeContratosIntoData(data, contratos, coop.id);
  }

  const op: OperacionalSyncPayload = operacional ?? {
    updatedAt: new Date(0).toISOString(),
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    config: { descontoPadraoCooperativa: 5 },
  };

  data = mergeOperacionalIntoData(data, op, coop.id, cloudCooperados);
  return data;
}

async function auditCooperativa(coop: Cooperativa) {
  const data = await buildDataForCoop(coop);
  if (!data) return;

  const cnpj = normalizeCnpj(coop.cnpj);
  const cooperados = data.cooperados.filter((c) => c.cooperativaId === coop.id);
  const meses = mesesAtivos(data, coop.id);

  console.log("\n" + "=".repeat(72));
  console.log(`COOPERATIVA: ${coop.nome} (${cnpj})`);
  console.log(`Cooperados: ${cooperados.length} | Notas: ${data.notasPedido.length} | Fichas: ${data.fichaCorrida.length}`);
  console.log("=".repeat(72));

  const dupes = findFichaDuplicates(data);
  const semFicha = notasSemFicha(data);
  const valorMismatch = fichasValorDivergeNota(data);

  if (dupes.length) {
    console.log(`\n⚠ Fichas duplicadas (antes dedupe lógico): ${dupes.length} nota(s)`);
    for (const d of dupes.slice(0, 10)) {
      console.log(`  - nota ${d.notaId}: ${d.count} lançamentos [${d.valores.map(fmt).join(", ")}]`);
    }
    if (dupes.length > 10) console.log(`  ... +${dupes.length - 10} mais`);
  } else {
    console.log("\n✓ Sem fichas duplicadas por nota (após dedupe)");
  }

  if (semFicha.length) {
    console.log(`\n⚠ Notas conferidas/pagas SEM ficha: ${semFicha.length}`);
    for (const n of semFicha.slice(0, 8)) {
      console.log(
        `  - ${n.cooperadoNomeSnapshot ?? n.cooperadoId} | ${n.mesReferencia} | ${fmt(n.valorLiquido)} | ${n.id.slice(0, 8)}`
      );
    }
  } else {
    console.log("\n✓ Todas notas conferidas/pagas têm ficha");
  }

  if (valorMismatch.length) {
    console.log(`\n⚠ Soma ficha ≠ valor nota: ${valorMismatch.length}`);
    for (const m of valorMismatch.slice(0, 8)) {
      console.log(`  - nota ${m.notaId.slice(0, 8)}: nota ${fmt(m.notaVal)} vs ficha ${fmt(m.fichaVal)}`);
    }
  } else {
    console.log("\n✓ Valores ficha batem com notas (conferidas/pagas)");
  }

  const adminStats = getAdminStats(data);
  const totalNetTodosCoops = round2(
    cooperados.reduce((s, c) => s + getTotalAPagarCooperado(data, c.id, undefined, coop.id), 0)
  );

  console.log("\n--- Totais globais (cooperativa) ---");
  console.log(`Painel admin "A pagar" (soma bruta ficha pendente): ${fmt(adminStats.valoresAPagar)}`);
  console.log(`Soma getTotalAPagarCooperado (líquido c/ mensalidade/descontos): ${fmt(totalNetTodosCoops)}`);
  console.log(`Diferença admin vs líquido: ${fmt(round2(adminStats.valoresAPagar - totalNetTodosCoops))}`);

  console.log("\n--- Por cooperado / mês ---");
  let divergencias = 0;

  for (const c of cooperados) {
    const mesesCoop = meses.filter((mes) => {
      const temNota = data.notasPedido.some(
        (n) =>
          n.mesReferencia === mes &&
          notaPertenceCooperado(data, n, c.id, c.cooperativaId) &&
          (n.status === "conferida" || n.status === "pago" || n.status === "aguardando_conferencia")
      );
      const temFicha = data.fichaCorrida.some(
        (f) => f.mesReferencia === mes && fichaPertenceCooperado(data, f, c.id, c.cooperativaId)
      );
      return temNota || temFicha;
    });

    if (mesesCoop.length === 0) continue;

    const totalLiquido = getTotalAPagarCooperado(data, c.id, undefined, coop.id);
    const totalFichaPendente = round2(
      mesesCoop.reduce(
        (s, mes) => s + somaFichaPendenteMes(data, c, mes),
        0
      )
    );

    const linhas: string[] = [];
    for (const mes of mesesCoop) {
      const fichaMes = somaFichaPendenteMes(data, c, mes);
      const notasMes = somaNotasCooperadoMes(data, c, mes, false);
      const notasStrict = somaNotasCooperadoMes(data, c, mes, true);
      const resumo = getResumoPagamentoCooperado(data, c.id, mes, coop.id);
      const fechamento = calcularFechamentoMensalLive(mes, data);
      const linhaFech = fechamento.linhasCooperado.find((l) => l.cooperadoId === c.id);

      const issues: string[] = [];
      if (Math.abs(fichaMes - notasMes) > TOL && resumo.valorEntregas > 0) {
        issues.push(`ficha≠notas(${fmt(fichaMes)} vs ${fmt(notasMes)})`);
      }
      if (Math.abs(notasStrict - notasMes) > TOL) {
        issues.push(`id remapeado(${fmt(notasStrict)} strict vs ${fmt(notasMes)} canon)`);
      }
      if (Math.abs(resumo.valorEntregas - fichaMes) > TOL) {
        issues.push(`resumo.entregas≠ficha(${fmt(resumo.valorEntregas)} vs ${fmt(fichaMes)})`);
      }
      if (linhaFech && Math.abs(linhaFech.aPagar - resumo.valorLiquido) > TOL) {
        issues.push(`fechamento.aPagar≠resumo(${fmt(linhaFech.aPagar)} vs ${fmt(resumo.valorLiquido)})`);
      }
      if (Math.abs(resumo.valorLiquido - fichaMes) > TOL && resumo.valorLiquido >= 0) {
        const ajuste = round2(fichaMes - resumo.valorLiquido);
        if (Math.abs(ajuste) > TOL) {
          issues.push(`líquido≠ficha bruta (ajustes ${fmt(ajuste)})`);
        }
      }

      if (issues.length) {
        divergencias += 1;
        linhas.push(
          `  ${mes}: ficha=${fmt(fichaMes)} notas=${fmt(notasMes)} líquido=${fmt(resumo.valorLiquido)} | ${issues.join("; ")}`
        );
      }
    }

    const gapTotal = round2(totalFichaPendente - totalLiquido);
    const headerGap =
      Math.abs(gapTotal) > TOL
        ? ` | TOTAL ficha ${fmt(totalFichaPendente)} vs líquido ${fmt(totalLiquido)} (Δ ${fmt(gapTotal)})`
        : "";

    if (linhas.length || headerGap) {
      console.log(`\n${c.nomeCompleto}${headerGap}`);
      for (const l of linhas) console.log(l);
    }
  }

  if (divergencias === 0) {
    console.log("\n✓ Nenhuma divergência estrutural por cooperado/mês (além de ajustes esperados de mensalidade/desconto).");
  } else {
    console.log(`\n⚠ ${divergencias} combinação(ões) cooperado/mês com divergência a investigar.`);
  }

  // Simula reconciliar (read-only preview — não grava)
  const reconciliado = reconciliarFichaFromNotasConferidas(data);
  const fichasAntes = data.fichaCorrida.length;
  const fichasDepois = reconciliado.fichaCorrida.length;
  const semFichaDepois = notasSemFicha(reconciliado);
  if (fichasDepois !== fichasAntes || semFichaDepois.length !== semFicha.length) {
    console.log(
      `\nℹ Se rodasse reconciliarFichaFromNotasConferidas: fichas ${fichasAntes} → ${fichasDepois}, notas sem ficha ${semFicha.length} → ${semFichaDepois.length}`
    );
  }
}

async function main() {
  const cooperativas = await loadCooperativas();
  const alvo = filterCnpj
    ? cooperativas.filter((c) => normalizeCnpj(c.cnpj) === filterCnpj)
    : cooperativas.filter((c) => {
        const cnpj = normalizeCnpj(c.cnpj);
        return cnpj === "62351750000165" || c.nome.toLowerCase().includes("coopeagri");
      });

  const lista = alvo.length ? alvo : cooperativas;
  if (!lista.length) {
    console.error("Nenhuma cooperativa encontrada.");
    process.exit(1);
  }

  console.log(`Auditoria de totais — ${lista.length} cooperativa(s) — ${new Date().toISOString()}`);

  for (const coop of lista) {
    await auditCooperativa(coop);
  }

  console.log("\n--- Fim da auditoria (somente leitura; nenhum dado alterado) ---\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
