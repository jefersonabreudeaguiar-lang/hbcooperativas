/**
 * Testes híbridos: HB Créditos ↔ valor a receber ↔ resumo cooperado.
 * npx tsx scripts/test-hb-valor-receber-hybrid.ts
 */
import assert from "node:assert/strict";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData, PagamentoCooperadoRegistro } from "../src/types";
import {
  resolveDescontosContaCoopMesParaCalculo,
  setContaCoopDescontosMemoria,
} from "../src/lib/hb-credit/contaCoopDescontosMemory.ts";
import { liquidoUsoContaCoopMes } from "../src/lib/hb-credit/mergeFichaDescontos.ts";
import {
  getResumoPagamentoCooperado,
  getResumoPagamentoExibicao,
  persistDescontosContaCoopNoArquivo,
} from "../src/services/notaPedidoService.ts";
import { getValorQuantoVouReceber } from "../src/services/cooperadoEntregasService.ts";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage.ts";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage.ts";
import { fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage.ts";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService.ts";
import { mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService.ts";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro.ts";
import { listCooperadoContaCoopDescontosAbateValorReceber } from "../src/lib/supabase/contaCoopStorage.ts";

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

const COOP = "coop-hb-test";
const COOPERADO = "c_coop_hb";
const MES = "2026-09";

function ficha(id: string, notaId: string, liq: number): AppData["fichaCorrida"][0] {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    notaPedidoId: notaId,
    mesReferencia: MES,
    status: "pendente",
    valorBruto: liq,
    descontos: 0,
    valorLiquido: liq,
    descricao: `Entrega nota ${notaId}`,
    createdAt: "2026-09-01T12:00:00.000Z",
  };
}

function nota(id: string): AppData["notasPedido"][0] {
  return {
    id,
    cooperativaId: COOP,
    cooperadoId: COOPERADO,
    mesReferencia: MES,
    status: "conferida",
    valorBruto: 100,
    valorLiquido: 100,
    instituicaoId: "inst-1",
    itens: [{ produtoId: "p1", quantidade: 1, precoUnitario: 100 }],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
}

function baseData(partial: Partial<AppData>): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Test", cnpj: "62351750000165", responsavel: "T", email: "t@t.com", telefone: "", endereco: "", createdAt: "" }],
    users: [],
    cooperados: [
      {
        id: COOPERADO,
        cooperativaId: COOP,
        nomeCompleto: "Cooperado HB",
        cpfCnpj: "123",
        telefone: "",
        endereco: "",
        comunidade: "",
        status: "ativo",
      },
    ],
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
    ...partial,
  };
}

// --- unit: memória vazia não apaga arquivo ---
{
  const arquivo = [
    { motivo: "Compra HB", valorReais: 30, tipo: "conta_coop" as const, createdAt: "2026-09-05T10:00:00.000Z" },
  ];
  const resolved = resolveDescontosContaCoopMesParaCalculo(arquivo, [], true);
  assert.equal(liquidoUsoContaCoopMes(resolved), 30, "memória [] deve cair back para arquivo");
}

// --- unit: memória com API prevalece ---
{
  const arquivo = [{ motivo: "Lixo arquivo", valorReais: 99, tipo: "conta_coop" as const, createdAt: "2026-09-01T10:00:00.000Z" }];
  const memoria = [{ motivo: "Compra HB API", valorReais: 25, tipo: "conta_coop" as const, createdAt: "2026-09-08T10:00:00.000Z" }];
  const resolved = resolveDescontosContaCoopMesParaCalculo(arquivo, memoria, true);
  assert.equal(liquidoUsoContaCoopMes(resolved), 25);
}

// --- unit: valor a receber com compra HB ---
{
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", 100)],
    notasPedido: [nota("n1")],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    { motivo: "Compra HB Créditos", valorReais: 40, tipo: "conta_coop", createdAt: "2026-09-10T10:00:00.000Z" },
  ]);
  const exib = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.equal(exib.valorLiquido, 60);
  assert.ok(exib.descontosExtras.some((d) => d.tipo === "conta_coop"));
  const card = getValorQuantoVouReceber(data, COOPERADO, COOP);
  assert.equal(card.valor, 60);
}

// --- unit: PIX aguardando + compra HB nova (entregas live) ---
{
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", 200)],
    notasPedido: [nota("n1")],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    { motivo: "Compra HB Créditos", valorReais: 50, tipo: "conta_coop", createdAt: "2026-09-11T10:00:00.000Z" },
  ]);
  const aguardando: PagamentoCooperadoRegistro = {
    id: "pg1",
    cooperadoId: COOPERADO,
    cooperativaId: COOP,
    mesReferencia: MES,
    status: "aguardando_confirmacao",
    valorBruto: 200,
    descontoCooperativa: 0,
    valorLiquido: 200,
    descontosExtras: [],
    fichaIds: ["f1"],
    notaPedidoIds: ["n1"],
    createdAt: "2026-09-12T10:00:00.000Z",
  };
  data = { ...data, pagamentosCooperado: [aguardando] };
  const exib = getResumoPagamentoExibicao(data, COOPERADO, MES, COOP);
  assert.equal(exib.valorLiquido, 150, "aguardando PIX deve refletir HB no valor líquido");
}

// --- unit: memória sessão + arquivo (poll vazio) ---
{
  let data = baseData({
    fichaCorrida: [ficha("f1", "n1", 80)],
    notasPedido: [nota("n1")],
  });
  data = persistDescontosContaCoopNoArquivo(data, COOPERADO, MES, COOP, [
    { motivo: "Compra HB", valorReais: 20, tipo: "conta_coop", createdAt: "2026-09-09T10:00:00.000Z" },
  ]);
  setContaCoopDescontosMemoria(COOP, COOPERADO, MES, []);
  const bruto = getResumoPagamentoCooperado(data, COOPERADO, MES, COOP);
  assert.equal(bruto.valorLiquido, 60, "memória HB vazia não pode zerar abatimento do arquivo");
}

async function cloudJefersonCheck() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("(skip nuvem — sem .env.local)");
    return;
  }
  const CNPJ = "62351750000165";
  const JEFERSON = "c_1781981564381_w67gg";
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  const { data: rows } = await sb.from("cooperativas").select("*").eq("cnpj", CNPJ);
  if (!rows?.length) return;
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
    operacional ?? { updatedAt: "", arquivosMensais: [], pagamentosCooperado: [], comunicados: [], mensalidades: [], descontos: [], config: {} },
    coop.id,
    cloudCooperados
  );

  for (const mes of ["2026-08", "2026-09"]) {
    const hbRows = await listCooperadoContaCoopDescontosAbateValorReceber(sb, CNPJ, [JEFERSON], mes);
    const hbLiquido = liquidoUsoContaCoopMes(
      hbRows.map((r) => ({
        motivo: r.motivo,
        valorReais: r.valorReais,
        tipo: "conta_coop" as const,
        createdAt: r.createdAt,
      }))
    );
    const exib = getResumoPagamentoExibicao(data, JEFERSON, mes, coop.id);
    const entregas = exib.valorEntregas;
    const coopNoResumo = exib.descontosExtras
      .filter((d) => d.tipo === "conta_coop")
      .reduce((s, d) => s + d.valor, 0);
    const estornos = exib.descontosExtras
      .filter((d) => d.tipo === "credito_avulso")
      .reduce((s, d) => s + d.valor, 0);
    const impliedHb = entregas - exib.valorLiquido + estornos - (exib.descontosExtras.filter((d) => d.tipo === "mensalidade" || d.tipo === "manual").reduce((s, d) => s + d.valor, 0));
    if (hbLiquido > 0.01 && entregas > 0) {
      assert.ok(
        Math.abs(coopNoResumo - hbLiquido) < 0.05 || Math.abs(impliedHb - hbLiquido) < 0.05,
        `Jeferson ${mes}: HB nuvem ${hbLiquido} vs resumo coop ${coopNoResumo} liquido ${exib.valorLiquido}`
      );
    }
  }

  const total = getValorQuantoVouReceber(data, JEFERSON, coop.id);
  assert.ok(total.valor >= 0);
  console.log(`Nuvem Jeferson OK — a receber consolidado ${total.valor.toFixed(2)} (${total.mesLabel})`);
}

async function main() {
  await cloudJefersonCheck();
  console.log("OK — testes híbridos HB valor a receber");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
