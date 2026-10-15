/**
 * Fatos produção: card Início (BIC snapshot) vs paridade Financeiro vs fichas pendentes.
 * npx tsx scripts/_diag-inicio-zero-prod-facts.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico, fichaPertenceCooperado } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { buildCooperadoFinanceiroUiSnapshot } from "../src/services/cooperadoFinanceiroUiSnapshot";
import { leituraFinanceiraParidadeCooperado } from "../src/lib/cooperado/cooperadoFinanceiroParidadeUniversal";
import { inicioCardMotorFromFinanceiroUiSnapshot } from "../src/lib/cooperadoInicioCardPolicy";
import { cooperadoTemReciboAssinadoLocalSemPendenciaUi } from "../src/lib/cooperado/cooperadoReciboAssinaturaLocalLatch";

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
process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
const MES_OUT = "2026-10";

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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
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
  console.log(`\n=== PRODUÇÃO readonly | ${CNPJ} | BIC official ON | build ${process.env.npm_package_version ?? "?"} ===\n`);

  type Row = {
    nome: string;
    canon: string;
    paridade: number;
    inicioSnap: number;
    inicioCard: number;
    fichaPendente: boolean;
    fichasPendenteCount: number;
    outubroFichaStatus: string;
    outubroValorFicha: number;
    reciboLocalUi: boolean;
  };
  const rows: Row[] = [];

  for (const c of data.cooperados.filter((x) => x.cooperativaId === coopId && x.status === "ativo")) {
    const canon = resolverCooperadoIdCanonico(data, c.id, coopId);
    const paridade = leituraFinanceiraParidadeCooperado(data, canon, coopId);
    const snap = buildCooperadoFinanceiroUiSnapshot({
      data,
      cooperadoId: canon,
      cooperativaId: coopId,
      opts: { apresentacaoConsolidada: true, dataReady: true },
    });
    const card = inicioCardMotorFromFinanceiroUiSnapshot(snap);
    const fichasPend = (data.fichaCorrida ?? []).filter(
      (f) => fichaPertenceCooperado(data, f, canon, coopId) && f.status === "pendente"
    );
    const outFichas = (data.fichaCorrida ?? []).filter(
      (f) => fichaPertenceCooperado(data, f, canon, coopId) && f.mesReferencia === MES_OUT
    );
    const outStatus = outFichas.map((f) => f.status).join("|") || "—";
    const outValor = outFichas.reduce((s, f) => s + (f.valorLiquido ?? 0), 0);
    rows.push({
      nome: c.nomeCompleto,
      canon,
      paridade: paridade.valorLiquido,
      inicioSnap: snap.valorAReceber,
      inicioCard: card.valor,
      fichaPendente: fichasPend.length > 0,
      fichasPendenteCount: fichasPend.length,
      outubroFichaStatus: outStatus,
      outubroValorFicha: outValor,
      reciboLocalUi: cooperadoTemReciboAssinadoLocalSemPendenciaUi(data, canon, coopId),
    });
  }

  const gap = rows.filter((r) => r.paridade > 0.01 && r.inicioSnap <= 0.01);
  console.log(`Cooperados ativos: ${rows.length}`);
  console.log(`Paridade>0 mas Início snapshot=0: ${gap.length}\n`);

  if (gap.length) {
    console.log("--- DIVERGÊNCIA Início vs Financeiro (nuvem) ---");
    for (const r of gap.sort((a, b) => b.paridade - a.paridade)) {
      console.log(
        `${r.nome.slice(0, 32).padEnd(33)} paridade=${r.paridade.toFixed(2)} inicio=${r.inicioSnap.toFixed(2)} ` +
          `fichaPendente=${r.fichaPendente} (${r.fichasPendenteCount}) out/${MES_OUT} status=${r.outubroFichaStatus} ` +
          `valorFicha=${r.outubroValorFicha.toFixed(2)} reciboLocalLatch=${r.reciboLocalUi}`
      );
    }
  } else {
    console.log("Nenhum cooperado com paridade>0 e Início snapshot=0 na nuvem reconciliada.");
  }

  const outubroComValor = rows.filter((r) => r.outubroValorFicha > 0.01 || r.outubroFichaStatus !== "—");
  console.log(`\n--- Outubro ${MES_OUT} (ficha na nuvem) — ${outubroComValor.length} cooperados com linha ---`);
  for (const r of outubroComValor.sort((a, b) => b.outubroValorFicha - a.outubroValorFicha).slice(0, 30)) {
    console.log(
      `${r.nome.slice(0, 28).padEnd(29)} status=${r.outubroFichaStatus.padEnd(12)} ficha=${r.outubroValorFicha.toFixed(2).padStart(10)} ` +
        `paridade=${r.paridade.toFixed(2).padStart(10)} inicio=${r.inicioSnap.toFixed(2).padStart(10)} pendente=${r.fichaPendente}`
    );
  }

  const inicioPos = rows.filter((r) => r.inicioSnap > 0.01);
  console.log(`\n--- Resumo ---`);
  console.log(`Início snapshot > 0: ${inicioPos.length}`);
  console.log(`Paridade > 0: ${rows.filter((r) => r.paridade > 0.01).length}`);
  console.log(`Com ficha status=pendente: ${rows.filter((r) => r.fichaPendente).length}`);

  console.log("\ndiag-inicio-zero-prod-facts: concluído\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
