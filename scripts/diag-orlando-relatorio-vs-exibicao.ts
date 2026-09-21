/**
 * Orlando — compara relatório (getResumoPagamentoCooperado) vs exibição (Conta Coop).
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
import {
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  getResumoPagamentoParaRegistro,
  getTotalAPagarCooperado,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { listarMesesPendentesPagamentoResponsavel } from "../src/services/cooperadoEntregasService";
import { getRelatorioPagarCooperadoEmAberto } from "../src/services/relatorioService";

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

const ORLANDO = "c_1782263929381_ncp55";
const CNPJ = normalizeCnpj("62351750000165");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

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
    valoresAvulsosReceber: [],
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
const op = await fetchOperacionalSync(sb, CNPJ);
if (!op) throw new Error("operacional ausente");
const notasStorage = await fetchNotasFromStorage(sb, CNPJ);
const notasTable = await fetchNotasFromTable(sb, CNPJ);
const coopRows = await fetchCooperadosFromStorage(sb, CNPJ);
const contratos = await fetchContratosSync(sb, CNPJ);

let data = emptyAppData();
data = mergeCloudCooperadosIntoData(data, coopRows, CNPJ);
data = mergeOperacionalIntoData(data, op);
data = mergeContratosIntoData(data, contratos);
data.notasPedido = mergeNotasSources(notasStorage, notasTable, data.notasPedido);
data = reconciliarFichaFromNotasConferidas(data);

const coop = data.cooperativas.find((c) => normalizeCnpj(c.cnpj) === CNPJ)!;
const meses = listarMesesPendentesPagamentoResponsavel(data, ORLANDO, coop.id);

console.log("=== Orlando — relatório vs ficha (Conta Coop) ===\n");
console.log("Meses pendentes:", meses.join(", "));

let totalRelatorio = 0;
let totalExibicao = 0;
let totalRegistro = 0;

for (const mes of meses) {
  const base = getResumoPagamentoCooperado(data, ORLANDO, mes, coop.id);
  const exib = getResumoPagamentoExibicao(data, ORLANDO, mes, coop.id);
  const reg = getResumoPagamentoParaRegistro(base, data, ORLANDO, mes, coop.id);
  totalRelatorio += base.valorLiquido;
  totalExibicao += exib.valorLiquido;
  totalRegistro += reg.valorLiquido;
  console.log(`\n${mes}:`);
  console.log(`  Relatório (sem Conta Coop): R$ ${base.valorLiquido.toFixed(2)}`);
  console.log(`  Exibição cooperado:       R$ ${exib.valorLiquido.toFixed(2)}`);
  console.log(`  Para registro pagamento:  R$ ${reg.valorLiquido.toFixed(2)}`);
  const contaCoop = reg.descontosExtras.filter((d) => d.tipo === "conta_coop");
  if (contaCoop.length) {
    console.log(
      "  Conta Coop:",
      contaCoop.map((d) => `${d.motivo}: R$ ${d.valor.toFixed(2)}`).join("; ")
    );
  }
}

console.log("\n--- Totais ---");
console.log(`Relatório em aberto:     R$ ${totalRelatorio.toFixed(2)}`);
console.log(`Exibição (ficha):      R$ ${totalExibicao.toFixed(2)}`);
console.log(`Registro pagamento:    R$ ${totalRegistro.toFixed(2)}`);
console.log(`getTotalAPagarCooperado: R$ ${getTotalAPagarCooperado(data, ORLANDO, undefined, coop.id).toFixed(2)}`);
console.log("Relatório consolidado:", getRelatorioPagarCooperadoEmAberto(data, coop.id, ORLANDO)[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
