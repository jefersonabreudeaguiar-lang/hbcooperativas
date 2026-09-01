/**
 * Realinha valores bruto/líquido das fichas com notas conferidas na nuvem.
 * Uso: npx tsx scripts/repair-fichas-valores-cloud.ts [cnpj] [mesReferencia]
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
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  fichasValoresAlinhadosComNota,
  reconciliarFichaFromNotasConferidas,
  rebuildFichasNota,
  somaValorBrutoFichasNota,
} from "../src/services/notaPedidoService";
import { calcularConciliacaoMensal } from "../src/services/conciliacaoMensalService";

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

const CNPJ = normalizeCnpj(process.argv[2] ?? "62351750000165");
const MES = process.argv[3] ?? "";

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

async function loadData() {
  const { data: rows } = await supabase.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) throw new Error(`Cooperativa não encontrada: ${CNPJ}`);
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);
  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, CNPJ),
    fetchNotasFromStorage(supabase, CNPJ),
    fetchNotasFromTable(supabase, CNPJ),
    fetchContratosSync(supabase, CNPJ),
    fetchOperacionalSync(supabase, CNPJ),
  ]);
  if (!operacional) throw new Error("operacional.json ausente na nuvem");

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
  return { data, operacional, coopId: coop.id };
}

async function main() {
  console.log(`=== Reparo valores ficha × nota | CNPJ ${CNPJ}${MES ? ` | mês ${MES}` : ""} ===\n`);
  const { data: merged, operacional, coopId } = await loadData();

  const antes = MES ? calcularConciliacaoMensal(merged, MES, coopId) : null;
  if (antes) {
    const linha = antes.linhas.find((l) => l.id === "entregas_ficha");
    console.log(
      `Antes (${MES}): notas R$ ${linha?.valorA.toFixed(2)} | ficha R$ ${linha?.valorB.toFixed(2)} | Δ R$ ${linha?.diferenca.toFixed(2)}`
    );
  }

  let data = merged;
  const notasAlvo = data.notasPedido.filter(
    (n) =>
      (n.status === "conferida" || n.status === "pago") &&
      (!MES || n.mesReferencia === MES)
  );

  const rawFichas = operacional.fichaCorrida ?? [];
  const idsReparo = new Set<string>();
  for (const nota of notasAlvo) {
    if (!fichasValoresAlinhadosComNota(rawFichas, nota)) idsReparo.add(nota.id);
    if (!fichasValoresAlinhadosComNota(data.fichaCorrida, nota)) idsReparo.add(nota.id);
  }
  console.log(`Notas a reparar (nuvem bruta ou mesclada): ${idsReparo.size}\n`);

  let reparadas = 0;
  for (const nota of notasAlvo) {
    if (!idsReparo.has(nota.id)) continue;
    const brutoAntes = somaValorBrutoFichasNota(data.fichaCorrida, nota.id);
    data = rebuildFichasNota(data, nota);
    const brutoDepois = somaValorBrutoFichasNota(data.fichaCorrida, nota.id);
    reparadas++;
    console.log(
      `  ${nota.cooperadoNomeSnapshot ?? nota.cooperadoId} | nota R$ ${nota.valorBruto.toFixed(2)} | ficha ${brutoAntes.toFixed(2)} → ${brutoDepois.toFixed(2)}`
    );
  }

  data = reconciliarFichaFromNotasConferidas(data);

  const depois = MES ? calcularConciliacaoMensal(data, MES, coopId) : null;
  if (depois) {
    const linha = depois.linhas.find((l) => l.id === "entregas_ficha");
    console.log(
      `\nDepois (${MES}): notas R$ ${linha?.valorA.toFixed(2)} | ficha R$ ${linha?.valorB.toFixed(2)} | Δ R$ ${linha?.diferenca.toFixed(2)}`
    );
    console.log(`Divergências conciliação: ${depois.resumo.divergencias}`);
  }

  if (reparadas === 0) {
    console.log("\nNenhuma nota precisou de reparo.");
    return;
  }

  const fichaCoop = data.fichaCorrida.filter((f) => f.cooperativaId === coopId);
  const payload = {
    ...operacional,
    updatedAt: new Date().toISOString(),
    fichaCorrida: fichaCoop,
    arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
  };

  const up = await uploadOperacionalSync(supabase, CNPJ, payload);
  if (!up.ok) {
    console.error("Falha no upload:", up.error);
    process.exit(1);
  }

  console.log(`\nUpload concluído: ${reparadas} nota(s) reparada(s), ${fichaCoop.length} lançamentos na ficha.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
