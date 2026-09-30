import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService";
import { bicCentralValorAReceberAgregado, bicCentralResolveInicioParaExibicao } from "../src/services/bicLeituraCentralCooperado";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const CNPJ = "62351750000165";
const JEFERSON = "c_1781981564381_w67gg";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error("coop not found");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, operacional] = await Promise.all([
    fetchCooperadosFromStorage(sb, CNPJ),
    fetchNotasFromStorage(sb, CNPJ),
    fetchNotasFromTable(sb, CNPJ),
    fetchOperacionalSync(sb, CNPJ),
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
  data = mergeOperacionalIntoData(
    data,
    operacional ?? {
      updatedAt: "",
      arquivosMensais: [],
      pagamentosCooperado: [],
      comunicados: [],
      mensalidades: [],
      descontos: [],
      config: {},
    },
    coop.id,
    cloudCooperados
  );

  const ficha = data.fichaCorrida.filter((f) => f.cooperadoId === JEFERSON);
  const pags = data.pagamentosCooperado.filter((p) => p.cooperadoId === JEFERSON);
  const notasJ = data.notasPedido.filter((n) => n.cooperadoId === JEFERSON);
  const legado = getValorQuantoVouReceber(data, JEFERSON, coop.id);
  const m6 = bicCentralValorAReceberAgregado(data, JEFERSON, coop.id, { apresentacaoConsolidada: true });
  const inicio = bicCentralResolveInicioParaExibicao(data, JEFERSON, coop.id, { apresentacaoConsolidada: true });

  console.log(
    JSON.stringify(
      {
        cooperadoId: JEFERSON,
        cooperativaId: coop.id,
        operacionalUpdatedAt: operacional?.updatedAt ?? null,
        fichaCount: ficha.length,
        fichaPendente: ficha.filter((f) => f.status === "pendente").length,
        fichaLiquidoTotal: ficha.reduce((s, f) => s + (f.valorLiquido ?? 0), 0),
        pagamentos: pags.map((p) => ({
          id: p.id,
          mes: p.mesReferencia,
          status: p.status,
          valorLiquido: p.valorLiquido,
        })),
        notasConferidas: notasJ.filter((n) => n.status === "conferida").length,
        notasAguardando: notasJ.filter((n) => n.status === "aguardando_conferencia").length,
        motorLegado: legado,
        motorBicM6: m6,
        inicioCardBic: inicio,
        cardMostrariaValor: inicio.valor > 0,
      },
      null,
      2
    )
  );
}

void main();
