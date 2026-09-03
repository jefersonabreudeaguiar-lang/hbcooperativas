/**
 * Alinha notas × fichas (centavos de arredondamento do desconto 5%).
 * Uso: npx tsx scripts/repair-notas-totais-ficha-cloud.ts [cnpj]
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
  notaPayloadForTable,
  uploadNotaToStorage,
  upsertNotasInTable,
} from "../src/lib/supabase/notasStorage";
import {
  fetchContratosSync,
  fetchOperacionalSync,
  uploadOperacionalSync,
} from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import {
  alinharFichaUnicaComNota,
  aplicarItensNaNota,
  calcularItensNota,
  fichasValoresAlinhadosComNota,
  sincronizarTotaisNotaComFichas,
} from "../src/services/notaPedidoService";

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

function corrigirPar(
  data: AppData,
  nota: NotaPedido
): { nota?: NotaPedido; fichaCorrida: AppData["fichaCorrida"]; changed: boolean; fichaChanged: boolean; itensMudaram: boolean } {
  if (nota.status !== "conferida" && nota.status !== "pago") {
    return { fichaCorrida: data.fichaCorrida, changed: false, fichaChanged: false, itensMudaram: false };
  }

  let base = nota;
  if ((nota.itens ?? []).some((i) => (i.quantidade ?? 0) > 0)) {
    base = aplicarItensNaNota(nota, nota.itens, nota.percentualDescontoCooperativa);
  }

  const fichas = data.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  if (!fichas.length) {
    return { fichaCorrida: data.fichaCorrida, changed: false, fichaChanged: false, itensMudaram: false };
  }

  let corrigida = sincronizarTotaisNotaComFichas(base, fichas, {
    forcarDescontoLiquido: fichas.length > 1,
    sincronizarBruto: fichas.length > 1,
    sincronizarItens: true,
  });

  const itensAntes = nota.itens ?? [];
  const itensDepois = corrigida.itens ?? [];
  const itensMudaram =
    itensAntes.length !== itensDepois.length ||
    calcularItensNota(itensAntes, nota.percentualDescontoCooperativa).valorBruto !==
      calcularItensNota(itensDepois, nota.percentualDescontoCooperativa).valorBruto;

  let fichaCorrida = data.fichaCorrida;
  const fichaNext = alinharFichaUnicaComNota(fichaCorrida, corrigida);
  const fichaChanged = fichaNext !== fichaCorrida;
  if (fichaChanged) fichaCorrida = fichaNext;

  const notaMudou =
    Math.abs(corrigida.valorBruto - nota.valorBruto) >= 0.005 ||
    Math.abs(corrigida.valorDesconto - nota.valorDesconto) >= 0.005 ||
    Math.abs(corrigida.valorLiquido - nota.valorLiquido) >= 0.005 ||
    itensMudaram;

  if (!notaMudou && !fichaChanged) {
    return { fichaCorrida, changed: false, fichaChanged: false, itensMudaram: false };
  }

  return {
    nota: notaMudou ? corrigida : undefined,
    fichaCorrida,
    changed: true,
    fichaChanged,
    itensMudaram,
  };
}

async function main() {
  console.log(`=== Reparo totais nota × ficha | CNPJ ${CNPJ} ===\n`);
  const { data: initial, operacional, coopId } = await loadData();
  let data = initial;

  const notasAlvo = data.notasPedido.filter((n) => n.status === "conferida" || n.status === "pago");
  const notasCorrigidas: NotaPedido[] = [];
  let fichasAlteradas = 0;

  for (const nota of notasAlvo) {
    const { nota: next, fichaCorrida, changed, fichaChanged, itensMudaram } = corrigirPar(data, nota);
    if (!changed) continue;
    data = { ...data, fichaCorrida };
    if (fichaChanged) fichasAlteradas++;
    if (next) {
      data = {
        ...data,
        notasPedido: data.notasPedido.map((n) => (n.id === nota.id ? next : n)),
      };
      notasCorrigidas.push(next);
      console.log(
        `  NOTA ${nota.numeroNota ?? nota.id.slice(0, 16)} | ${nota.cooperadoNomeSnapshot ?? "—"} | bruto ${nota.valorBruto.toFixed(2)} → ${next.valorBruto.toFixed(2)} | itens ${itensMudaram ? "sync ficha" : "—"}`
      );
    } else {
      console.log(`  FICHA ${nota.numeroNota ?? nota.id.slice(0, 16)} | ${nota.cooperadoNomeSnapshot ?? "—"} alinhada à nota`);
    }
  }

  if (notasCorrigidas.length === 0 && fichasAlteradas === 0) {
    console.log("Nenhuma correção necessária.");
    return;
  }

  console.log(`\nEnviando ${notasCorrigidas.length} nota(s) e ${fichasAlteradas} ajuste(s) de ficha...\n`);

  for (const nota of notasCorrigidas) {
    const payload = notaPayloadForTable(nota);
    const table = await upsertNotasInTable(supabase, CNPJ, [payload], nota.cooperadoNomeSnapshot);
    if (!table.ok && !table.tableMissing) {
      console.error("Falha tabela:", table.error);
      process.exit(1);
    }
    const storage = await uploadNotaToStorage(supabase, CNPJ, payload, nota.cooperadoNomeSnapshot);
    if (!storage.ok) {
      console.error("Falha storage:", storage.error);
      process.exit(1);
    }
  }

  if (fichasAlteradas > 0) {
    const payload = {
      ...operacional,
      updatedAt: new Date().toISOString(),
      fichaCorrida: data.fichaCorrida.filter((f) => f.cooperativaId === coopId),
      arquivosMensais: data.arquivosMensais.filter((a) => a.cooperativaId === coopId),
    };
    const up = await uploadOperacionalSync(supabase, CNPJ, payload);
    if (!up.ok) {
      console.error("Falha operacional:", up.error);
      process.exit(1);
    }
  }

  const restantes = notasAlvo.filter((n) => !fichasValoresAlinhadosComNota(data.fichaCorrida, n)).length;
  console.log(`Concluído. Notas ainda desalinhadas: ${restantes}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
