/**
 * Orlando — valor visível ao cooperado vs elegibilidade na aba Correções (apagar/re-lançar).
 * Read-only; não altera dados.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import type { AppData } from "../src/types";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeOperacionalIntoData, mergeContratosIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  reconciliarFichaFromNotasConferidas,
  podeExcluirEntregaNota,
  podeRelancarEntregaNota,
  listarEntregasCorrecaoCooperado,
  getTotalAPagarCooperado,
} from "../src/services/notaPedidoService";
import {
  getResumoMesEntregasCooperado,
  getValorQuantoVouReceber,
  cooperadoMesQuitado,
} from "../src/services/cooperadoEntregasService";
import { fetchOperacionalSync, fetchContratosSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";

const ORLANDO = "c_1782263929381_ncp55";
const CNPJ = normalizeCnpj("62351750000165");

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
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    descontosCooperado: [],
    descontos: [],
    valoresAvulsosReceber: [],
    entregas: [],
    pagamentos: [],
    reclamacoes: [],
    propriedades: [],
    veiculos: [],
    livroCaixa: [],
    prestacoesContas: [],
    prestacoesContasExcluidas: [],
    notasPedidoExcluidas: [],
    instituicoesExcluidas: [],
    auditLog: [],
    pareceresContabeis: [],
    fechamentoSnapshots: [],
    fechamentos: [],
    financeiro: [],
    config: { descontoPadraoCooperativa: 5 },
    ajustesFichaMes: [],
    cronogramasContrato: [],
    votacaoPautas: [],
    votacaoVotos: [],
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });

  const op = await fetchOperacionalSync(sb, CNPJ);
  if (!op) throw new Error("operacional ausente");

  let data = emptyAppData();
  data = mergeCloudCooperadosIntoData(data, await fetchCooperadosFromStorage(sb, CNPJ), CNPJ);
  data = mergeOperacionalIntoData(data, op);
  data = mergeContratosIntoData(data, await fetchContratosSync(sb, CNPJ));
  data.notasPedido = mergeNotasSources(
    await fetchNotasFromStorage(sb, CNPJ),
    await fetchNotasFromTable(sb, CNPJ),
    data.notasPedido
  );
  data = reconciliarFichaFromNotasConferidas(data);

  const coop = data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === CNPJ)!;
  const cid = coop.id;
  const canon = resolverCooperadoIdCanonico(data, ORLANDO, cid);

  console.log("=== Orlando — valor vs Correções ===\n");
  console.log("Canonico:", canon);
  console.log("Quanto vou receber:", getValorQuantoVouReceber(data, ORLANDO, cid));
  console.log("Total a pagar (motor):", getTotalAPagarCooperado(data, ORLANDO, undefined, cid));

  const notaEnvolve = (n: (typeof data.notasPedido)[0]) =>
    resolverCooperadoIdCanonico(data, n.cooperadoId, cid, n.cooperadoNomeSnapshot) === canon;

  const notasOrlando = data.notasPedido.filter((n) => notaEnvolve(n));
  console.log("\nNotas (" + notasOrlando.length + "):");
  for (const n of [...notasOrlando].sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia))) {
    const ex = podeExcluirEntregaNota(data, n.id, cid);
    const rel = podeRelancarEntregaNota(data, n.id, cid);
    const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === n.id);
    console.log(
      `  ${n.mesReferencia} ${n.status} liq=${n.valorLiquido} excluir=${ex.ok ? "ok" : ex.reason} relancar=${rel.ok ? "ok" : rel.reason} fichas=[${fichas.map((f) => f.status + ":" + f.valorLiquido).join(", ")}]`
    );
  }

  const fichasPend = data.fichaCorrida.filter(
    (f) => (f.cooperadoId === ORLANDO || f.cooperadoId === canon) && f.status === "pendente" && f.valorLiquido > 0
  );
  console.log("\nFicha pendente com valor:");
  for (const f of fichasPend) {
    const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
    const ex = nota ? podeExcluirEntregaNota(data, nota.id, cid) : null;
    console.log(
      `  ${f.mesReferencia} ficha=${f.valorLiquido} nota=${nota?.status ?? "MISSING"} excluir=${ex ? (ex.ok ? "ok" : ex.reason) : "n/a"}`
    );
  }

  console.log("\nPagamentos cooperado:");
  for (const p of data.pagamentosCooperado.filter((p) => p.cooperadoId === ORLANDO || p.cooperadoId === canon)) {
    console.log(
      `  ${p.mesReferencia} ${p.status} liq=${p.valorLiquido} notaIds=${(p.notaPedidoIds ?? []).join(",")}`
    );
  }

  const apagar = listarEntregasCorrecaoCooperado(data, ORLANDO, cid, "apagar");
  console.log("\nCorreções (apagar):", apagar.length, apagar.map((n) => `${n.numeroNota} ${n.status} ${n.valorLiquido}`));

  for (const mes of [...new Set(notasOrlando.map((n) => n.mesReferencia))]) {
    const r = getResumoMesEntregasCooperado(data, ORLANDO, mes, cid);
    if (r.valorAReceber > 0 || r.valorRecebido > 0) {
      console.log(
        `Resumo ${mes}: aReceber=${r.valorAReceber} recebido=${r.valorRecebido} quitado=${cooperadoMesQuitado(data, ORLANDO, mes)}`
      );
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
