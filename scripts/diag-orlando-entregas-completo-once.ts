/**
 * Orlando — soma de todas as notas/entregas (read-only).
 * npx tsx scripts/diag-orlando-entregas-completo-once.ts
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, NotaPedido } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import {
  fetchNotasFromStorage,
  fetchNotasFromTable,
  mergeNotasSources,
} from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  getResumoPagamentoCooperado,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import { getResumoMesEntregasCooperado } from "../src/services/cooperadoEntregasService";

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

const CNPJ = normalizeCnpj("62351750000165");
const ORLANDO = "c_1782263929381_ncp55";

function sum(notas: NotaPedido[], pick: (n: NotaPedido) => number) {
  return notas.reduce((s, n) => s + pick(n), 0);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("coop not found");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const coopId = coop.id;

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  if (!operacional) throw new Error("sem operacional");

  let data: AppData = {
    cooperativas: [coop],
    users: [],
    cooperados: [],
    mensalidades: [],
    cotas: [],
    instituicoes: [],
    produtosInstituicao: [],
    notasPedido: mergeNotasSources(tableResult.notas, storageNotas).map((n) => ({
      ...n,
      cooperativaId: n.cooperativaId ?? coopId,
    })),
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
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
    config: { descontoPadraoCooperativa: 5 },
  };
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coopId);
  if (contratos) data = mergeContratosIntoData(data, contratos, coopId);
  data = mergeOperacionalIntoData(data, operacional, coopId, cloudCooperados);
  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));

  const canon = resolverCooperadoIdCanonico(data, ORLANDO, coopId);
  const notas = data.notasPedido.filter(
    (n) => resolverCooperadoIdCanonico(data, n.cooperadoId, coopId, n.cooperadoNomeSnapshot) === canon
  );

  console.log("=== Orlando Fetisch — entregas / notas (nuvem", new Date().toISOString(), ") ===\n");
  console.log("Cooperado:", canon);

  const byStatus = new Map<string, NotaPedido[]>();
  for (const n of notas) {
    const list = byStatus.get(n.status) ?? [];
    list.push(n);
    byStatus.set(n.status, list);
  }
  console.log("Total notas:", notas.length);
  console.log("Soma bruta (todas):", sum(notas, (n) => n.valorBruto ?? 0).toFixed(2));
  console.log("Soma líquida (todas):", sum(notas, (n) => n.valorLiquido ?? 0).toFixed(2));
  console.log("\nPor status:");
  for (const [st, list] of [...byStatus.entries()].sort()) {
    console.log(
      `  ${st}: ${list.length} notas | bruto ${sum(list, (n) => n.valorBruto ?? 0).toFixed(2)} | liq ${sum(list, (n) => n.valorLiquido ?? 0).toFixed(2)}`
    );
  }

  const conferidas = notas.filter((n) => n.status === "conferida" || n.status === "pago");
  console.log("\nConferidas + pagas (bruto):", sum(conferidas, (n) => n.valorBruto ?? 0).toFixed(2));
  console.log("Conferidas + pagas (líq):", sum(conferidas, (n) => n.valorLiquido ?? 0).toFixed(2));

  const byMes = new Map<string, NotaPedido[]>();
  for (const n of notas) {
    const list = byMes.get(n.mesReferencia) ?? [];
    list.push(n);
    byMes.set(n.mesReferencia, list);
  }
  console.log("\n--- Por mês ---");
  for (const mes of [...byMes.keys()].sort().reverse()) {
    const list = byMes.get(mes)!;
    const r = getResumoMesEntregasCooperado(data, ORLANDO, mes, coopId);
    const pag = getResumoPagamentoCooperado(data, ORLANDO, mes, coopId);
    console.log(`\n${mes} | resumo entregas aReceber=${r.valorAReceber.toFixed(2)} recebido=${r.valorRecebido.toFixed(2)}`);
    console.log(
      `  pagamento base: entregas=${pag.valorEntregas.toFixed(2)} liq=${pag.valorLiquido.toFixed(2)} desc=${(pag.valorDescontos ?? 0).toFixed(2)}`
    );
    for (const n of [...list].sort((a, b) => a.numeroNota.localeCompare(b.numeroNota))) {
      const itensBr = (n.itens ?? []).reduce((s, i) => s + (i.valorBruto ?? 0), 0);
      console.log(
        `  ${n.numeroNota} | ${n.status} | br ${(n.valorBruto ?? 0).toFixed(2)} | liq ${(n.valorLiquido ?? 0).toFixed(2)} | itensΣ ${itensBr.toFixed(2)} | ${n.dataEntrega.slice(0, 10)} | ${(n.instituicaoNome ?? n.descricao ?? "").slice(0, 40)}`
      );
    }
  }

  const n200 = notas.find((n) => n.numeroNota === "2026-0200");
  if (n200?.itens?.length) {
    console.log("\n--- Nota 2026-0200 (consolidada set/2026) — itens ---");
    let tb = 0;
    for (const i of n200.itens) {
      tb += i.valorBruto ?? 0;
      console.log(`  ${i.produtoNome} | ${i.quantidade} ${i.unidade} @ ${i.precoUnitario} = ${(i.valorBruto ?? 0).toFixed(2)}`);
    }
    console.log("  Σ itens bruto:", tb.toFixed(2), "| nota bruto:", (n200.valorBruto ?? 0).toFixed(2));
  }

  console.log("\n--- Ficha corrida (todas) ---");
  const ficha = data.fichaCorrida.filter((f) => f.cooperadoId === ORLANDO || f.cooperadoId === canon);
  for (const mes of [...new Set(ficha.map((f) => f.mesReferencia))].sort().reverse()) {
    const lines = ficha.filter((f) => f.mesReferencia === mes);
    const pendLiq = lines.filter((f) => f.status === "pendente").reduce((s, f) => s + f.valorLiquido, 0);
    console.log(`${mes}: ${lines.length} linhas | pend liq ${pendLiq.toFixed(2)}`);
    for (const f of lines) {
      console.log(`  ${f.status} | liq ${f.valorLiquido.toFixed(2)} | ${f.descricao?.slice(0, 55)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
