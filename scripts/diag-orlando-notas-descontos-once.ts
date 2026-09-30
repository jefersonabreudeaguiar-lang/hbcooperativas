/** Orlando — bruto, líquido e descontos das notas + set/2026 (read-only). */
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
import { mergeCloudCooperadosIntoData, resolverCooperadoIdCanonico } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  getResumoPagamentoCooperado,
  getResumoValorAPagarRelatorio,
  reconciliarFichaFromNotasConferidas,
} from "../src/services/notaPedidoService";
import { posProcessarIntegridadePagamentosCooperativa } from "../src/services/pagamentoIntegridadeService";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "../src/lib/supabase/contaCoopStorage";
import { getPagamentoConfirmadoCooperadoMes } from "../src/services/notaPedidoService";

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
const MES = "2026-09";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("coop");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const coopId = coop.id;

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchContratosSync(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
  ]);
  if (!operacional) throw new Error("operacional");

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
  } as AppData;
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, CNPJ, coopId);
  if (contratos) data = mergeContratosIntoData(data, contratos, coopId);
  data = mergeOperacionalIntoData(data, operacional, coopId, cloudCooperados);
  data = posProcessarIntegridadePagamentosCooperativa(reconciliarFichaFromNotasConferidas(data));

  const canon = resolverCooperadoIdCanonico(data, ORLANDO, coopId);
  const notas = data.notasPedido.filter(
    (n) => resolverCooperadoIdCanonico(data, n.cooperadoId, coopId, n.cooperadoNomeSnapshot) === canon
  );

  const conferidasPagas = notas.filter((n) => n.status === "conferida" || n.status === "pago");
  const brutoAll = notas.reduce((s, n) => s + (n.valorBruto ?? 0), 0);
  const liqAll = notas.reduce((s, n) => s + (n.valorLiquido ?? 0), 0);
  const brutoCp = conferidasPagas.reduce((s, n) => s + (n.valorBruto ?? 0), 0);
  const liqCp = conferidasPagas.reduce((s, n) => s + (n.valorLiquido ?? 0), 0);

  console.log("=== Orlando Fetisch — notas (nuvem", new Date().toISOString(), ") ===\n");
  console.log("TODAS as notas (3): bruto R$", brutoAll.toFixed(2), "| líquido R$", liqAll.toFixed(2));
  console.log(
    "Conferida + paga: bruto R$",
    brutoCp.toFixed(2),
    "| líquido R$",
    liqCp.toFixed(2),
    "| desconto taxa cooperativa (5%): R$",
    (brutoCp - liqCp).toFixed(2)
  );
  console.log("\n--- Por nota ---");
  for (const n of [...notas].sort((a, b) => a.numeroNota.localeCompare(b.numeroNota))) {
    const br = n.valorBruto ?? 0;
    const li = n.valorLiquido ?? 0;
    console.log(`\n${n.numeroNota} | ${n.status} | ${n.mesReferencia} | ${n.dataEntrega.slice(0, 10)}`);
    console.log(`  Bruto: R$ ${br.toFixed(2)}  →  Líquido: R$ ${li.toFixed(2)}  (desconto na nota: R$ ${(br - li).toFixed(2)})`);
    for (const d of n.descontosDetalhe ?? []) {
      console.log(`  • ${d.motivo ?? d.tipo}: R$ ${Number(d.valor).toFixed(2)}`);
    }
    if (!n.descontosDetalhe?.length && br > li) {
      console.log(`  • Taxa cooperativa (5%): R$ ${(br - li).toFixed(2)}`);
    }
  }

  const base = getResumoPagamentoCooperado(data, ORLANDO, MES, coopId);
  const rel = getResumoValorAPagarRelatorio(data, ORLANDO, MES, coopId);
  const pix = getPagamentoConfirmadoCooperadoMes(data, ORLANDO, MES);

  console.log("\n=== Setembro/2026 — o que entra na ficha / A receber ===");
  console.log("Valor entregas (ficha aberta): R$", base.valorEntregas.toFixed(2));
  console.log("A receber (motor / nota 0200): R$", rel.valorLiquido.toFixed(2));
  if (pix) console.log("PIX já confirmado no mês: R$", pix.valorLiquido.toFixed(2), "(nota 0146 quitada no fluxo)");

  console.log("\nDescontos EXTRAS no relatório (além da taxa 5% da nota):");
  if (!rel.descontosExtras.length) console.log("  (nenhum no operacional local desta carga — HB pode estar só na nuvem até sync)");
  for (const d of rel.descontosExtras) {
    console.log(`  • [${d.tipo}] ${d.motivo} — R$ ${d.valor.toFixed(2)}`);
  }

  const hb = await listCooperadoContaCoopDescontosAbateValorReceber(sb, CNPJ, canon, MES);
  console.log("\n=== HB Créditos (nuvem → abate A receber quando sincronizado) ===");
  let totalHb = 0;
  for (const h of hb) {
    console.log(`  • ${h.motivo} — R$ ${h.valorReais.toFixed(2)}`);
    totalHb += h.valorReais;
  }
  console.log("Total compras HB (impacto típico no A receber): R$", totalHb.toFixed(2));

  console.log("\n=== Resumo para leitura ===");
  console.log("Bruto total (0146+0200): R$", brutoCp.toFixed(2));
  console.log("Após taxa 5% cooperativa (líquido das notas): R$", liqCp.toFixed(2));
  console.log("Em aberto (0200 conferida): R$ 4077,76");
  console.log("Já pago na ficha (0146): R$ 233,32 líquido | PIX creditado R$ 123,42 (resto = retenções na ficha)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
