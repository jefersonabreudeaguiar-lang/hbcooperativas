/**
 * Diagnose HB base 0 vs consolidado > 0 (raw vs sane AppData).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";
import { getConsolidadoFinanceiroCooperado } from "../src/services/cooperadoEntregasService";
import {
  bicCentralValorAReceberAgregado,
  bicCentralResolveInicioParaExibicao,
} from "../src/services/bicLeituraCentralCooperado";
import { hbCreditCreditoBaseReais } from "../src/lib/hb-credit/hbCreditLeituraBic";
import { prepararAppDataParaCreditoBaseHb } from "../src/modules/hb-credit/engine/creditBaseHbGuard";
import { cooperadoFichaValoresDesalinhados } from "../src/services/fichaSyncGuard";
import { getCreditoBaseContaCoopReais, getCreditoBaseCooperadoCents } from "../src/modules/hb-credit/engine/creditBaseFromFicha";
import type { AppData } from "../src/types";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const HB_OPTS = { apresentacaoConsolidada: true as const };

loadEnv();
if (
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL &&
  !process.env.NEXT_PUBLIC_BIC_CENTRAL_READ &&
  !process.env.HB_BIC_LAB_B4_AUTHORITY
) {
  process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL = "true";
}

async function loadData(cnpj: string): Promise<{ data: AppData; coopId: string }> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    realtime: { transport: ws },
  });
  const { data: coopRows } = await sb.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (!coopRows?.length) throw new Error("Cooperativa não encontrada");
  const coop = cooperativaFromCloudRow(coopRows[0] as Record<string, unknown>);
  const [operacional, cloudCooperados, storageNotas, tableResult, contratos] = await Promise.all([
    fetchOperacionalSync(sb, cnpj),
    fetchCooperadosFromStorage(sb, cnpj),
    fetchNotasFromStorage(sb, cnpj),
    fetchNotasFromTable(sb, cnpj),
    fetchContratosSync(sb, cnpj),
  ]);
  if (!operacional) throw new Error("operacional.json ausente");
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
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, cnpj, coop.id);
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);
  data = reconciliarFichaFromNotasConferidas(data);
  return { data, coopId: coop.id };
}

function diag(data: AppData, coopId: string, nomePart: string) {
  const c = data.cooperados.find((x) => x.nomeCompleto.toLowerCase().includes(nomePart.toLowerCase()));
  if (!c) {
    console.log("not found:", nomePart);
    return;
  }
  const sane = prepararAppDataParaCreditoBaseHb(data);
  const finRaw = getConsolidadoFinanceiroCooperado(data, c.id, coopId);
  const finSane = getConsolidadoFinanceiroCooperado(sane, c.id, coopId);
  const m6Raw = bicCentralValorAReceberAgregado(data, c.id, coopId, HB_OPTS);
  const m6Sane = bicCentralValorAReceberAgregado(sane, c.id, coopId, HB_OPTS);
  const inicioSane = bicCentralResolveInicioParaExibicao(sane, c.id, coopId, HB_OPTS);
  const desal = cooperadoFichaValoresDesalinhados(sane, c.id, coopId);
  console.log("\n===", c.nomeCompleto, c.id, "===");
  console.log("ficha raw/sane:", data.fichaCorrida.filter((f) => f.cooperadoId === c.id).length, "/", sane.fichaCorrida.filter((f) => f.cooperadoId === c.id).length);
  console.log("consolidado raw/sane:", finRaw.valorLiquido, finSane.valorLiquido);
  console.log("m6 raw/sane:", m6Raw.valor, m6Sane.valor, "aguard:", m6Raw.aguardandoAssinatura, m6Sane.aguardandoAssinatura);
  console.log("inicio sane:", inicioSane.exibir, inicioSane.valor);
  console.log("hbCreditCreditoBaseReais sane:", hbCreditCreditoBaseReais(sane, c.id, coopId));
  console.log("getCreditoBaseContaCoopReais:", getCreditoBaseContaCoopReais(data, c.id, coopId));
  console.log("ficha desalinhada:", desal);
  console.log("getCreditoBaseCooperadoCents R$", getCreditoBaseCooperadoCents(data, c.id, coopId) / 100);
}

async function main() {
  const cnpj = process.argv[2]?.replace(/\D/g, "") || "62351750000165";
  const { data, coopId } = await loadData(cnpj);
  console.log("BIC enabled:", process.env.NEXT_PUBLIC_BIC_CENTRAL_READ_OFFICIAL, process.env.NEXT_PUBLIC_BIC_CENTRAL_READ);
  for (const n of ["Caroliny", "Ailton", "Júlio", "Cleber", "Orlando"]) {
    diag(data, coopId, n);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
