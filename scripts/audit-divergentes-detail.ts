/** Detalhe dos cooperados com divergência — npx tsx scripts/audit-divergentes-detail.ts */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import {
  fichaPertenceCooperado,
  mergeCloudCooperadosIntoData,
  notaPertenceCooperado,
} from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { dedupeFichaCorridaPorNota, getResumoPagamentoCooperado } from "../src/services/notaPedidoService";
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
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

const CNPJ = "62351750000165";
const MES = "2026-08";
const NOMES = ["Jeferson", "Cleber", "Mailda", "Roseli", "Railandia"];

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

async function main() {
  const data = await loadData();
  const dedAll = dedupeFichaCorridaPorNota(data.fichaCorrida, data.notasPedido);
  console.log(`Fichas: ${data.fichaCorrida.length} raw → ${dedAll.length} após dedupe`);

  for (const fragmento of NOMES) {
    const c = data.cooperados.find((x) => x.nomeCompleto.toLowerCase().includes(fragmento.toLowerCase()));
    if (!c) {
      console.log("Não encontrado:", fragmento);
      continue;
    }

    const fichas = data.fichaCorrida.filter(
      (f) =>
        f.mesReferencia === MES &&
        f.status === "pendente" &&
        fichaPertenceCooperado(data, f, c.id, c.cooperativaId)
    );
    const fichasDed = dedupeFichaCorridaPorNota(fichas, data.notasPedido);
    const notasOk = data.notasPedido.filter(
      (n) =>
        n.mesReferencia === MES &&
        (n.status === "conferida" || n.status === "pago") &&
        notaPertenceCooperado(data, n, c.id, c.cooperativaId)
    );
    const sumF = fichas.reduce((s, f) => s + f.valorLiquido, 0);
    const sumFd = fichasDed.reduce((s, f) => s + f.valorLiquido, 0);
    const sumN = notasOk.reduce((s, n) => s + n.valorLiquido, 0);
    const resumo = getResumoPagamentoCooperado(data, c.id, MES, c.cooperativaId);

    console.log(`\n=== ${c.nomeCompleto} (${c.id}) ===`);
    console.log(`Fichas: ${fichas.length} (dedupe: ${fichasDed.length}) soma ${sumF.toFixed(2)} / ded ${sumFd.toFixed(2)}`);
    console.log(`Notas: ${notasOk.length} soma ${sumN.toFixed(2)}`);
    console.log(`Resumo: entregas ${resumo.valorEntregas} líquido ${resumo.valorLiquido}`);

    const notaIdsFicha = new Set(fichasDed.map((f) => f.notaPedidoId));
    const notaIdsNotas = new Set(notasOk.map((n) => n.id));
    const soFicha = [...notaIdsFicha].filter((id) => !notaIdsNotas.has(id));
    const soNota = [...notaIdsNotas].filter((id) => !notaIdsFicha.has(id));
    if (soFicha.length) console.log("Notas só na ficha:", soFicha.join(", "));
    if (soNota.length) console.log("Notas só em notasPedido:", soNota.join(", "));

    for (const f of fichasDed) {
      const nota = data.notasPedido.find((n) => n.id === f.notaPedidoId);
      console.log(
        `  ficha ${f.id.slice(0, 16)} nota=${f.notaPedidoId.slice(0, 22)} val=${f.valorLiquido.toFixed(2)} notaCoop=${nota?.cooperadoId?.slice(0, 12) ?? "?"} status=${nota?.status ?? "?"}`
      );
    }
  }
}

main().catch(console.error);
