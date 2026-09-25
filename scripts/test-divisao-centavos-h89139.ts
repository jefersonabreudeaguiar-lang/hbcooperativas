/**
 * H8.9.139 — conservação monetária no rateio entre cooperados.
 * npx tsx scripts/test-divisao-centavos-h89139.ts
 */
import assert from "node:assert/strict";
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichasDivisaoFromNota,
  criarDivisaoEntregaFromParticipantes,
  somaTotaisFichasNota,
  consolidarItensLancamentoPorFoto,
  sincronizarTotaisNotaComFichas,
  getTotalAPagarCooperado,
} from "../src/services/notaPedidoService.ts";
import { round2 } from "../src/utils/calculations.ts";
import type { AppData, FichaCorrida, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

const COOP = "coop-139";
const IDS = ["c1", "c2", "c3", "c4"];

function item(id: string, nome: string, qty: number, preco: number): NotaPedidoItem {
  return {
    produtoInstituicaoId: id,
    produtoNome: nome,
    unidade: "un",
    precoUnitario: preco,
    quantidade: qty,
    valorBruto: 0,
  };
}

function itens133(): NotaPedidoItem[] {
  return [
    item("p1", "Alface", 3, 4.5),
    item("p2", "Tomate", 2.333, 8.99),
    item("p3", "Cenoura", 1.111, 5.15),
  ];
}

function baseData(n: number): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: IDS.slice(0, n).map((id, i) => ({
      id,
      cooperativaId: COOP,
      nomeCompleto: `Coop ${i + 1}`,
      cpfCnpj: String(i),
      status: "ativo",
      createdAt: "",
      updatedAt: "",
    })),
    users: [],
    notasPedido: [],
    fichaCorrida: [],
    pagamentosCooperado: [],
    arquivosMensais: [],
    mensalidades: [],
    comunicados: [],
    instituicoes: [{ id: "inst-1", cooperativaId: COOP, nome: "Escola", createdAt: "", updatedAt: "" }],
    produtosInstituicao: [],
    descontos: [],
    notasPedidoExcluidas: [],
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function notaDe(itens: NotaPedidoItem[], pct: number): NotaPedido {
  return aplicarItensNaNota(
    {
      id: "np_139",
      cooperativaId: COOP,
      cooperadoId: "c1",
      cooperadoNomeSnapshot: "Coop 1",
      instituicaoId: "inst-1",
      numeroNota: "1",
      dataEntrega: "2026-08-01",
      mesReferencia: "2026-08",
      status: "conferida",
      conferidaPor: "Resp",
      itens: [],
      valorBruto: 0,
      percentualDescontoCooperativa: pct,
      valorDesconto: 0,
      valorLiquido: 0,
      createdAt: "",
      updatedAt: "",
    } as NotaPedido,
    itens,
    pct
  );
}

function dividir(nota: NotaPedido, n: number) {
  const d = baseData(n);
  const divisao = criarDivisaoEntregaFromParticipantes(d, COOP, "c1", "Coop 1", IDS.slice(0, n))!;
  const fichas = buildFichasDivisaoFromNota(d, { ...nota, divisaoEntrega: divisao }, "Resp", divisao, []);
  const tot = somaTotaisFichasNota(fichas, nota.id);
  return { d, fichas, tot, nota: { ...nota, divisaoEntrega: divisao } };
}

function assertConserva(label: string, nota: NotaPedido, tot: ReturnType<typeof somaTotaisFichasNota>) {
  assert.equal(tot.valorBruto, nota.valorBruto, `${label} bruto`);
  assert.equal(tot.valorLiquido, nota.valorLiquido, `${label} liquido`);
  console.log(
    `  ${label}: nota ${nota.valorBruto}/${nota.valorLiquido} fichas ${tot.valorBruto}/${tot.valorLiquido} Δ=0`
  );
}

// CASO PRINCIPAL 36,17 / 2
{
  const nota = notaDe(itens133(), 10);
  assert.equal(nota.valorBruto, 40.19);
  assert.equal(nota.valorLiquido, 36.17);
  const { tot } = dividir(nota, 2);
  assertConserva("2 coop fixture 36.17", nota, tot);
  assert.notEqual(tot.valorBruto, 40.16);
  assert.notEqual(tot.valorLiquido, 36.14);
}

for (const n of [2, 3, 4] as const) {
  const nota = notaDe(itens133(), 10);
  const { tot } = dividir(nota, n);
  assertConserva(`${n} coop fixture`, nota, tot);
}

for (const [nome, bruto, n] of [
  ["36/2", 36, 2],
  ["100/2", 100, 2],
  ["100/4", 100, 4],
] as const) {
  const nota = notaDe([item("x", "X", 1, bruto)], 0);
  const { tot } = dividir(nota, n);
  assertConserva(nome, nota, tot);
}

{
  const fotos = [
    calcularItensNota([item("", "A", 10, 5)], 0).itens,
    calcularItensNota([item("", "B", 2, 100)], 0).itens,
    calcularItensNota([item("", "C", 1, 7)], 0).itens,
  ];
  const cons = consolidarItensLancamentoPorFoto(fotos);
  assert.equal(cons.length, 3);
  const nota = notaDe(cons, 0);
  assert.equal(nota.valorBruto, 257);
  for (const n of [2, 3, 4]) {
    const { tot } = dividir(nota, n);
    assertConserva(`257 / ${n} (IDs vazios separados)`, nota, tot);
  }
}

// Itens normais: calcularItensNota continua qty × preço (não usa valorBruto prévio)
{
  const fake = { ...item("p1", "Alface", 3, 4.5), valorBruto: 999 };
  const normal = calcularItensNota([fake], 0);
  assert.equal(normal.valorBruto, 13.5);
  console.log("ITENS NORMAIS OK — calcularItensNota usa qty×preço (13.50), ignora valorBruto 999");
}

// H8.9.134: lançamento 36.17 vs ficha antiga 18
{
  const nota = notaDe(itens133(), 10);
  const { tot, fichas } = dividir(nota, 2);
  const fichaAntiga: FichaCorrida = {
    ...fichas[0],
    id: "fc_old",
    valorBruto: 20,
    descontos: 2,
    valorLiquido: 18,
  };
  const synced = sincronizarTotaisNotaComFichas(nota, [fichaAntiga], {
    forcarDescontoLiquido: true,
    preservarTotaisDoLancamentoAtual: true,
  });
  assert.equal(synced.valorLiquido, 36.17);
  assert.equal(synced.valorBruto, 40.19);
  console.log("H8.9.134 + rateio OK — ficha 18 não rebaixa 36.17");
  void tot;
}

// A Receber = soma fichas = nota (sem extras)
{
  const nota = notaDe(itens133(), 10);
  const { d, tot, fichas, nota: notaDiv } = dividir(nota, 2);
  const app: AppData = { ...d, notasPedido: [notaDiv], fichaCorrida: fichas };
  const receber = getTotalAPagarCooperado(app, "c1", "2026-08", COOP);
  assert.equal(tot.valorLiquido, 36.17);
  assert.equal(round2(fichas.filter((f) => f.cooperadoId === "c1").reduce((s, f) => s + f.valorLiquido, 0)), receber);
  console.log(`A Receber coop1=${receber} (parte da nota 36.17, soma fichas ${tot.valorLiquido})`);
}

console.log("\nH8.9.139 — todos os casos OK");
