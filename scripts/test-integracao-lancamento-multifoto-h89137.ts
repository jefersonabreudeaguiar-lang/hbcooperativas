/**
 * H8.9.137 — regressão integrada H8.9.134 + H8.9.136 (somente validação).
 * npx tsx scripts/test-integracao-lancamento-multifoto-h89137.ts
 */
import assert from "node:assert/strict";
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichaFromNota,
  consolidarItensLancamentoPorFoto,
  sincronizarTotaisNotaComFichas,
  getTotalAPagarCooperado,
  getResumoValorAPagarRelatorio,
} from "../src/services/notaPedidoService.ts";
import type { AppData, FichaCorrida, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const C1 = "c_alpha";
const NOTA_ID = "np_h89137";

function item(
  nome: string,
  qty: number,
  preco: number,
  id: string
): NotaPedidoItem {
  return {
    produtoInstituicaoId: id,
    produtoNome: nome,
    unidade: "un",
    precoUnitario: preco,
    quantidade: qty,
    valorBruto: 0,
  };
}

function fotos257(): NotaPedidoItem[][] {
  return [
    calcularItensNota([item("A", 10, 5, ""), item("B", 2, 100, "")], 0).itens,
    calcularItensNota([item("C", 1, 7, "")], 0).itens,
  ];
}

function baseData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      {
        id: C1,
        cooperativaId: COOP,
        nomeCompleto: "Alpha",
        cpfCnpj: "1",
        status: "ativo",
        createdAt: "",
        updatedAt: "",
      },
    ],
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
    config: { descontoPadraoCooperativa: 0 },
  } as AppData;
}

function notaVazia(): NotaPedido {
  return {
    id: NOTA_ID,
    cooperativaId: COOP,
    cooperadoId: C1,
    cooperadoNomeSnapshot: "Alpha",
    instituicaoId: "inst-1",
    numeroNota: "2026-0137",
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-08-01",
    itens: [],
    valorBruto: 0,
    percentualDescontoCooperativa: 0,
    valorDesconto: 0,
    valorLiquido: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

/** Cadeia do lançamento (espelha handleLancarNota + flags H8.9.134). */
function lancar(
  fotos: NotaPedidoItem[][],
  fichasExistentes: FichaCorrida[],
  descontoPct = 0
) {
  const cons = consolidarItensLancamentoPorFoto(fotos);
  const calc = calcularItensNota(cons, descontoPct);
  let nota = aplicarItensNaNota(notaVazia(), cons, descontoPct);
  const existentes = fichasExistentes.filter((f) => f.notaPedidoId === nota.id);
  if (existentes.length > 0) {
    nota = sincronizarTotaisNotaComFichas(nota, fichasExistentes, {
      forcarDescontoLiquido: true,
      sincronizarBruto: existentes.length > 1,
      preservarTotaisDoLancamentoAtual: true,
    });
  }
  const data = baseData();
  const ficha = buildFichaFromNota(nota, data, "Resp", "Alpha");
  const app: AppData = {
    ...data,
    notasPedido: [nota],
    fichaCorrida: [ficha],
  };
  const aReceber = getTotalAPagarCooperado(app, C1, "2026-08", COOP);
  const resumo = getResumoValorAPagarRelatorio(app, C1, "2026-08", COOP);
  return { cons, calc, nota, ficha, aReceber, resumo };
}

function fichaStub(bruto: number, liq: number): FichaCorrida {
  const d = baseData();
  const seed = buildFichaFromNota(
    { ...notaVazia(), valorBruto: bruto, valorLiquido: liq, valorDesconto: bruto - liq },
    d,
    "Resp",
    "Alpha"
  );
  return { ...seed, id: "fc_old", valorBruto: bruto, valorLiquido: liq, descontos: bruto - liq };
}

// 1 — fluxo completo sem ficha prévia
{
  const r = lancar(fotos257(), []);
  assert.equal(r.nota.valorBruto, 257);
  assert.equal(r.nota.valorLiquido, 257);
  assert.equal(r.ficha.valorBruto, 257);
  assert.equal(r.ficha.valorLiquido, 257);
  assert.notEqual(r.nota.valorBruto, 65);
  assert.equal(r.nota.valorLiquido, r.ficha.valorLiquido);
  console.log("1 OK — sem ficha prévia: nota/ficha bruto=257 (não 65)");
}

// 2 — ficha antiga menor 100
{
  const r = lancar(fotos257(), [fichaStub(100, 100)]);
  assert.equal(r.nota.valorBruto, 257);
  assert.equal(r.nota.valorLiquido, 257);
  assert.notEqual(r.nota.valorBruto, 357);
  console.log("2 OK — ficha antiga 100 não rebaixa nem soma: 257");
}

// 3 — mesmo ID entre fotos
{
  const r = lancar(
    [
      calcularItensNota([item("A", 5, 10, "prod-a")], 0).itens,
      calcularItensNota([item("A", 3, 10, "prod-a")], 0).itens,
    ],
    []
  );
  assert.equal(r.nota.valorBruto, 80);
  assert.equal(r.cons.length, 1);
  assert.equal(r.cons[0].quantidade, 8);
  console.log("3 OK — mesmo ID: 8×10=80");
}

// 4 — sem ID em 3 fotos
{
  const r = lancar(
    [
      calcularItensNota([item("A", 10, 5, "")], 0).itens,
      calcularItensNota([item("B", 2, 100, "")], 0).itens,
      calcularItensNota([item("C", 1, 7, "")], 0).itens,
    ],
    []
  );
  assert.equal(r.nota.valorBruto, 257);
  assert.equal(r.cons.length, 3);
  assert.notEqual(r.nota.valorBruto, 65);
  console.log("4 OK — IDs vazios em 3 fotos: 257 (não 13×5=65)");
}

// 5 — ID vazio + ID válido
{
  const r = lancar(
    [calcularItensNota([item("A", 10, 5, ""), item("B", 2, 100, "produto-123")], 0).itens],
    []
  );
  assert.equal(r.nota.valorBruto, 250);
  assert.equal(r.cons.length, 2);
  console.log("5 OK — vazio + válido: 250, 2 itens");
}

// 6 — multi-foto 257 + ficha antiga 65
{
  const r = lancar(fotos257(), [fichaStub(65, 65)]);
  assert.equal(r.nota.valorBruto, 257);
  assert.equal(r.nota.valorLiquido, 257);
  assert.equal(r.ficha.valorBruto, 257);
  assert.notEqual(r.nota.valorBruto, 65);
  assert.notEqual(r.nota.valorBruto, 322);
  console.log("6 OK — 257 + ficha antiga 65 → 257 (não 65, não 322)");
}

// 7 — ficha igual
{
  const r = lancar(fotos257(), [fichaStub(257, 257)]);
  assert.equal(r.nota.valorBruto, 257);
  assert.equal(r.nota.valorLiquido, 257);
  console.log("7 OK — ficha igual 257: permanece 257");
}

// 8 — ficha maior: registrar comportamento atual (H8.9.134 não inventa aumento)
{
  const r = lancar(fotos257(), [fichaStub(300, 300)]);
  console.log(
    `8 INFO — ficha maior 300: notaBruto=${r.nota.valorBruto} notaLiq=${r.nota.valorLiquido} (regra existente, sem patch novo)`
  );
  assert.equal(r.nota.valorBruto, 300);
  assert.equal(r.nota.valorLiquido, 300);
  console.log("8 OK — ficha maior: alinha à ficha 300 (comportamento pré-existente)");
}

// 9 — A Receber = líquido da ficha (sem extras)
{
  const r = lancar(fotos257(), []);
  assert.equal(r.nota.valorLiquido, r.ficha.valorLiquido);
  assert.equal(r.aReceber, 257);
  assert.equal(r.resumo.valorLiquido, 257);
  assert.equal(r.resumo.valorEntregas, 257);
  console.log("9 OK — A Receber=257 = nota/ficha líquido");
}

console.log("\nH8.9.137 — integração 134+136 OK");
