/**
 * H8.9.134 — ficha antiga não rebaixa o lançamento atual.
 * npx tsx scripts/test-lancamento-valor-h89134.ts
 */
import assert from "node:assert/strict";
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichaFromNota,
  buildFichasDivisaoFromNota,
  sincronizarTotaisNotaComFichas,
  somaTotaisFichasNota,
  criarDivisaoEntregaFromParticipantes,
} from "../src/services/notaPedidoService.ts";
import { round2 } from "../src/utils/calculations.ts";
import type { AppData, FichaCorrida, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

const COOP = "06342dae-8191-4193-94b6-d0be3a82e10b";
const C1 = "c_alpha";
const C2 = "c_beta";
const NOTA_ID = "np_diag_134";

function itensCatalogo(): NotaPedidoItem[] {
  return [
    {
      produtoInstituicaoId: "p1",
      produtoNome: "Alface",
      unidade: "un",
      precoUnitario: 4.5,
      quantidade: 3,
      valorBruto: 0,
    },
    {
      produtoInstituicaoId: "p2",
      produtoNome: "Tomate",
      unidade: "kg",
      precoUnitario: 8.99,
      quantidade: 2.333,
      valorBruto: 0,
    },
    {
      produtoInstituicaoId: "p3",
      produtoNome: "Cenoura",
      unidade: "kg",
      precoUnitario: 5.15,
      quantidade: 1.111,
      valorBruto: 0,
    },
  ];
}

function baseData(): AppData {
  return {
    cooperativas: [{ id: COOP, nome: "Coop", cnpj: "62351750000165", createdAt: "", updatedAt: "" }],
    cooperados: [
      { id: C1, cooperativaId: COOP, nomeCompleto: "Alpha", cpfCnpj: "1", status: "ativo", createdAt: "", updatedAt: "" },
      { id: C2, cooperativaId: COOP, nomeCompleto: "Beta", cpfCnpj: "2", status: "ativo", createdAt: "", updatedAt: "" },
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
    config: { descontoPadraoCooperativa: 10 },
  } as AppData;
}

function notaBase(): NotaPedido {
  return {
    id: NOTA_ID,
    cooperativaId: COOP,
    cooperadoId: C1,
    cooperadoNomeSnapshot: "Alpha",
    instituicaoId: "inst-1",
    numeroNota: "2026-0001",
    dataEntrega: "2026-08-01",
    mesReferencia: "2026-08",
    status: "conferida",
    conferidaPor: "Resp",
    dataConferencia: "2026-08-01",
    itens: [],
    valorBruto: 0,
    percentualDescontoCooperativa: 10,
    valorDesconto: 0,
    valorLiquido: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

/** Espelha o call site de handleLancarNota após calcular os itens atuais. */
function syncNoLancamento(nota: NotaPedido, fichas: FichaCorrida[]): NotaPedido {
  const existentes = fichas.filter((f) => f.notaPedidoId === nota.id);
  if (existentes.length === 0) return nota;
  return sincronizarTotaisNotaComFichas(nota, fichas, {
    forcarDescontoLiquido: true,
    sincronizarBruto: existentes.length > 1,
    preservarTotaisDoLancamentoAtual: true,
  });
}

const d = baseData();
const calc = calcularItensNota(
  itensCatalogo().map((i) => ({ ...i, valorBruto: 0 })),
  10
);
const notaLancamento = aplicarItensNaNota(notaBase(), itensCatalogo().map((i) => ({ ...i, valorBruto: 0 })), 10);
assert.equal(notaLancamento.valorLiquido, 36.17);
assert.equal(calc.valorLiquido, 36.17);

const fichaAlinhada = buildFichaFromNota(notaLancamento, d, "Resp", "Alpha");

function fichaParcial(id: string, bruto: number, desc: number, liq: number): FichaCorrida {
  return {
    ...fichaAlinhada,
    id,
    valorBruto: bruto,
    descontos: desc,
    valorLiquido: liq,
    itens: [{ ...itensCatalogo()[0], quantidade: 1, valorBruto: 4.5 }],
  };
}

// CASO 1 — sem ficha prévia
{
  const out = syncNoLancamento(notaLancamento, []);
  assert.equal(out.valorLiquido, 36.17);
  assert.equal(out.valorBruto, notaLancamento.valorBruto);
  console.log("CASO 1 OK — sem ficha prévia: 36.17");
}

// CASO 2 — ficha antiga menor (o defeito 36.17 → 18.00)
{
  const out = syncNoLancamento(notaLancamento, [fichaParcial("fc_old", 20, 2, 18)]);
  assert.equal(out.valorLiquido, 36.17, "não rebaixar líquido");
  assert.equal(out.valorBruto, notaLancamento.valorBruto, "não rebaixar bruto");
  assert.equal(out.itens.length, notaLancamento.itens.length, "não substituir itens pelo consolidado da ficha antiga");
  console.log("CASO 2 OK — ficha 18.00 não rebaixa lançamento 36.17");
}

// Sem a flag, o default antigo ainda rebaixa (repair/outros fluxos)
{
  const legado = sincronizarTotaisNotaComFichas(notaLancamento, [fichaParcial("fc_old", 20, 2, 18)], {
    forcarDescontoLiquido: true,
  });
  assert.equal(legado.valorLiquido, 18);
  console.log("CASO 2b OK — default sem flag ainda alinha nota à ficha (outros fluxos)");
}

// CASO 3 — ficha igual
{
  const out = syncNoLancamento(notaLancamento, [fichaAlinhada]);
  assert.equal(out.valorLiquido, 36.17);
  assert.equal(out.valorBruto, notaLancamento.valorBruto);
  console.log("CASO 3 OK — ficha igual: 36.17");
}

// CASO 4 — ficha maior: não inventar aumento além da regra já existente
{
  const fichaMaior = fichaParcial("fc_hi", 50, 5, 45);
  const outLancamento = syncNoLancamento(notaLancamento, [fichaMaior]);
  const outLegado = sincronizarTotaisNotaComFichas(notaLancamento, [fichaMaior], {
    forcarDescontoLiquido: true,
  });
  assert.equal(outLancamento.valorLiquido, outLegado.valorLiquido);
  assert.equal(outLancamento.valorLiquido, 45);
  console.log("CASO 4 OK — ficha maior: mantém regra existente (nota alinha à ficha, sem regra nova de aumento)");
}

// CASO 5 — duas fichas cuja soma é menor: não reduzir nem somar com o lançamento
{
  const duas = [
    fichaParcial("fc_a", 10, 1, 9),
    fichaParcial("fc_b", 10, 1, 9),
  ];
  const soma = somaTotaisFichasNota(duas, NOTA_ID);
  assert.equal(soma.valorLiquido, 18);
  const out = syncNoLancamento(notaLancamento, duas);
  assert.equal(out.valorLiquido, 36.17);
  assert.notEqual(out.valorLiquido, round2(36.17 + 18), "não duplicar (novo+antigo)");
  console.log("CASO 5 OK — duas fichas 9+9 não rebaixam nem duplicam");
}

// CASO 6 — dois cooperados: proteção não duplica; não “corrige” centavos da divisão
{
  const divisao = criarDivisaoEntregaFromParticipantes(d, COOP, C1, "Alpha", [C1, C2])!;
  const notaDiv = { ...notaLancamento, divisaoEntrega: divisao };
  const fichasDiv = buildFichasDivisaoFromNota(d, notaDiv, "Resp", divisao, []);
  const somaDiv = somaTotaisFichasNota(fichasDiv, NOTA_ID);
  const outAlinhadas = syncNoLancamento(notaDiv, fichasDiv);
  assert.ok(Math.abs(outAlinhadas.valorLiquido - notaDiv.valorLiquido) < 0.05);
  const fichasBaixas = fichasDiv.map((f, i) => ({ ...f, valorBruto: 10, descontos: 1, valorLiquido: 9, id: `fc_div_${i}` }));
  const outBaixas = syncNoLancamento(notaDiv, fichasBaixas);
  assert.equal(outBaixas.valorLiquido, notaDiv.valorLiquido);
  assert.notEqual(outBaixas.valorLiquido, round2(notaDiv.valorLiquido + somaTotaisFichasNota(fichasBaixas, NOTA_ID).valorLiquido));
  console.log(
    `CASO 6 OK — divisão 2 cooperados: soma fichas=${somaDiv.valorLiquido} nota=${notaDiv.valorLiquido}; fichas baixas não rebaixam/duplicam`
  );
}

console.log("\nH8.9.134 — todos os casos OK");
