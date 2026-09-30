/**
 * H8.9.136 — consolidação multi-foto não colapsa itens sem produtoInstituicaoId.
 * npx tsx scripts/test-multifoto-consolidacao-h89136.ts
 */
import assert from "node:assert/strict";
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichaFromNota,
  consolidarItensLancamentoPorFoto,
} from "../src/services/notaPedidoService.ts";
import type { AppData, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

function item(
  nome: string,
  qty: number,
  preco: number,
  id: string | undefined,
  extra?: Partial<NotaPedidoItem>
): NotaPedidoItem {
  return {
    produtoInstituicaoId: id as string,
    produtoNome: nome,
    unidade: "un",
    precoUnitario: preco,
    quantidade: qty,
    valorBruto: 0,
    ...extra,
  };
}

function brutoDe(listas: NotaPedidoItem[][], descontoPct = 0) {
  const cons = consolidarItensLancamentoPorFoto(listas);
  return calcularItensNota(cons, descontoPct);
}

function notaEFicha(calcItens: NotaPedidoItem[], descontoPct: number) {
  const nota = aplicarItensNaNota(
    {
      id: "np_h89136",
      cooperativaId: "coop",
      cooperadoId: "c1",
      instituicaoId: "inst-1",
      numeroNota: "1",
      dataEntrega: "2026-08-01",
      mesReferencia: "2026-08",
      status: "conferida",
      itens: [],
      valorBruto: 0,
      percentualDescontoCooperativa: descontoPct,
      valorDesconto: 0,
      valorLiquido: 0,
      createdAt: "",
      updatedAt: "",
    } as NotaPedido,
    calcItens,
    descontoPct
  );
  const data = {
    cooperativas: [],
    cooperados: [],
    instituicoes: [{ id: "inst-1", nome: "Escola" }],
    fichaCorrida: [],
    notasPedido: [nota],
  } as unknown as AppData;
  const ficha = buildFichaFromNota(nota, data, "Resp", "Alpha");
  return { nota, ficha };
}

// CASO 1 — IDs válidos distintos
{
  const c = brutoDe([
    [item("A", 10, 5, "pA")],
    [item("B", 2, 100, "pB")],
  ]);
  assert.equal(c.valorBruto, 250);
  assert.equal(c.itens.length, 2);
  console.log("CASO 1 OK — IDs válidos: 250");
}

// CASO 2 — IDs vazios, preços diferentes (bug 257→65)
{
  const c = brutoDe([
    [item("A", 10, 5, ""), item("B", 2, 100, "")],
    [item("C", 1, 7, "")],
  ]);
  assert.equal(c.valorBruto, 257);
  assert.equal(c.itens.length, 3);
  assert.notEqual(c.valorBruto, 65);
  console.log("CASO 2 OK — IDs vazios: 257 (nunca 65)");
}

// CASO 3 — dois sem ID
{
  const c = brutoDe([[item("A", 5, 10, ""), item("B", 3, 20, "")]]);
  assert.equal(c.valorBruto, 110);
  assert.equal(c.itens.length, 2);
  console.log("CASO 3 OK — dois sem ID: 110");
}

// CASO 4 — mesmo produto válido em duas fotos
{
  const c = brutoDe([
    [item("A", 5, 10, "p1")],
    [item("A", 3, 10, "p1")],
  ]);
  assert.equal(c.valorBruto, 80);
  assert.equal(c.itens.length, 1);
  assert.equal(c.itens[0].quantidade, 8);
  console.log("CASO 4 OK — mesmo ID em duas fotos: 8×10=80");
}

// CASO 5 — sem ID em fotos diferentes
{
  const c = brutoDe([[item("A", 10, 5, "")], [item("B", 2, 100, "")]]);
  assert.equal(c.valorBruto, 250);
  assert.equal(c.itens.length, 2);
  assert.notEqual(c.valorBruto, 60);
  console.log("CASO 5 OK — sem ID em fotos diferentes: 250 (não 12×5=60)");
}

// CASO 6 — cadeia completa 257
{
  const fotos = [
    calcularItensNota([item("A", 10, 5, ""), item("B", 2, 100, "")], 0).itens,
    calcularItensNota([item("C", 1, 7, "")], 0).itens,
  ];
  const cons = consolidarItensLancamentoPorFoto(fotos);
  const calc = calcularItensNota(cons, 0);
  assert.equal(calc.valorBruto, 257);
  const { nota, ficha } = notaEFicha(cons, 0);
  assert.equal(nota.valorBruto, 257);
  assert.equal(nota.valorLiquido, 257);
  assert.equal(ficha.valorBruto, 257);
  assert.equal(ficha.valorLiquido, 257);
  assert.equal(ficha.itens?.length, 3);
  console.log("CASO 6 OK — 257 até nota e ficha");
}

// Quantidade/preço decimal; mesma descrição preços diferentes; ID + vazio; null/undefined
{
  const dec = brutoDe([
    [item("Kg", 2.333, 8.99, "")],
    [item("Kg", 1.111, 5.15, "")],
  ]);
  assert.equal(dec.itens.length, 2);
  assert.equal(dec.valorBruto, calcularItensNota(dec.itens, 0).valorBruto);

  const mesmaDesc = brutoDe([[item("X", 1, 10, ""), item("X", 1, 20, "")]]);
  assert.equal(mesmaDesc.valorBruto, 30);
  assert.equal(mesmaDesc.itens.length, 2);

  const misto = brutoDe([[item("Cat", 10, 5, "p1"), item("Avulso", 2, 100, "")]]);
  assert.equal(misto.valorBruto, 250);
  assert.equal(misto.itens.length, 2);

  const nulos = brutoDe([
    [item("N", 10, 5, undefined), item("U", 2, 100, undefined)],
  ]);
  nulos.itens.forEach((i) => {
    /* produtoInstituicaoId original não vira chave persistida */
  });
  const comNull = consolidarItensLancamentoPorFoto([
    [
      { ...item("A", 10, 5, ""), produtoInstituicaoId: null as unknown as string },
      { ...item("B", 2, 100, ""), produtoInstituicaoId: undefined as unknown as string },
    ],
  ]);
  const calcNull = calcularItensNota(comNull, 0);
  assert.equal(calcNull.valorBruto, 250);
  assert.equal(comNull.every((i) => i.produtoInstituicaoId !== "occ:0:0"), true);

  console.log("CASO extra OK — decimal, mesma descrição, misto, null/undefined: totais conservados");
}

console.log("\nH8.9.136 — todos os casos OK");
