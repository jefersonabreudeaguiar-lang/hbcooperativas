/**
 * H8.9.140 — regressão integrada 134 + 136 + 139 (somente validação, sem código de produção).
 * npx tsx scripts/test-fluxo-valor-nota-h89140.ts
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
  rebuildFichasNota,
} from "../src/services/notaPedidoService.ts";
import { getCreditoBaseContaCoopReais } from "../src/modules/hb-credit/engine/creditBaseFromFicha.ts";
import { round2 } from "../src/utils/calculations.ts";
import type { AppData, FichaCorrida, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

const COOP = "coop-140";
const IDS = ["c1", "c2", "c3", "c4"];
const MES = "2026-08";

function item(id: string | null, nome: string, qty: number, preco: number): NotaPedidoItem {
  return {
    produtoInstituicaoId: id ?? "",
    produtoNome: nome,
    unidade: "un",
    precoUnitario: preco,
    quantidade: qty,
    valorBruto: 0,
  };
}

/** Caso 36,17: qty×preço não representa o rateio em centavos (Tomate/Cenoura). */
function fotosPrincipal(): NotaPedidoItem[][] {
  return [
    calcularItensNota(
      [
        item("", "Alface", 3, 4.5),
        item(null as unknown as string, "Tomate", 2.333, 8.99),
      ],
      0
    ).itens,
    calcularItensNota([item("", "Cenoura", 1.111, 5.15)], 0).itens,
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

function notaSeed(): NotaPedido {
  return {
    id: "np_140",
    cooperativaId: COOP,
    cooperadoId: "c1",
    cooperadoNomeSnapshot: "Coop 1",
    instituicaoId: "inst-1",
    numeroNota: "140",
    dataEntrega: "2026-08-01",
    mesReferencia: MES,
    status: "conferida",
    conferidaPor: "Resp",
    itens: [],
    valorBruto: 0,
    percentualDescontoCooperativa: 10,
    valorDesconto: 0,
    valorLiquido: 0,
    createdAt: "",
    updatedAt: "",
  } as NotaPedido;
}

function lancarComRateio(
  fotos: NotaPedidoItem[][],
  nCoops: number,
  pct: number,
  fichasAntigas: FichaCorrida[] = []
) {
  const cons = consolidarItensLancamentoPorFoto(fotos);
  const calc = calcularItensNota(cons, pct);
  let nota = aplicarItensNaNota(notaSeed(), cons, pct);
  nota = {
    ...nota,
    valorBruto: calc.valorBruto,
    valorDesconto: calc.valorDesconto,
    valorLiquido: calc.valorLiquido,
    itens: calc.itens,
    status: "conferida",
  };

  if (fichasAntigas.length > 0) {
    nota = sincronizarTotaisNotaComFichas(nota, fichasAntigas, {
      forcarDescontoLiquido: true,
      sincronizarBruto: fichasAntigas.length > 1,
      preservarTotaisDoLancamentoAtual: true,
    });
  }

  const d0 = { ...baseData(nCoops), fichaCorrida: fichasAntigas };
  const divisao = criarDivisaoEntregaFromParticipantes(d0, COOP, "c1", "Coop 1", IDS.slice(0, nCoops));
  if (divisao) nota = { ...nota, divisaoEntrega: divisao };

  const rebuilt = rebuildFichasNota({ ...d0, notasPedido: [nota] }, nota);
  const fichas = rebuilt.fichaCorrida.filter((f) => f.notaPedidoId === nota.id);
  const tot = somaTotaisFichasNota(fichas, nota.id);

  const aReceberPorCoop = IDS.slice(0, nCoops).map((id) =>
    getTotalAPagarCooperado(rebuilt, id, MES, COOP)
  );
  const aReceber = round2(aReceberPorCoop.reduce((s, v) => s + v, 0));

  const hbPorCoop = IDS.slice(0, nCoops).map((id) => getCreditoBaseContaCoopReais(rebuilt, id, COOP));
  const hb = round2(hbPorCoop.reduce((s, v) => s + v, 0));

  return { cons, calc, nota, fichas, tot, aReceber, aReceberPorCoop, hb, hbPorCoop, rebuilt };
}

function assertEq(label: string, got: number, exp: number) {
  assert.equal(got, exp, `${label}: got ${got} expected ${exp}`);
}

let principal: ReturnType<typeof lancarComRateio>;

console.log("=== H8.9.140 fluxo integrado ===\n");

{
  const fotos = fotosPrincipal();
  principal = lancarComRateio(fotos, 2, 10);

  assert.equal(principal.cons.length, 3, "IDs vazios/null não agrupam");
  assertEq("consolidacao bruto via calc", principal.calc.valorBruto, 40.19);

  assertEq("nota bruto", principal.nota.valorBruto, 40.19);
  assertEq("nota desconto", principal.nota.valorDesconto, 4.02);
  assertEq("nota liquido", principal.nota.valorLiquido, 36.17);

  assertEq("fichas bruto", principal.tot.valorBruto, 40.19);
  assertEq("fichas desconto", principal.tot.valorDesconto, 4.02);
  assertEq("fichas liquido", principal.tot.valorLiquido, 36.17);
  assert.notEqual(principal.tot.valorBruto, 40.16);
  assert.notEqual(principal.tot.valorLiquido, 36.14);

  assertEq("A Receber soma", principal.aReceber, 36.17);
  assert.equal(principal.fichas.length, 2, "sem duplicidade de ficha");
  const idsFicha = new Set(principal.fichas.map((f) => f.id));
  assert.equal(idsFicha.size, principal.fichas.length);

  assertEq("HB soma entrada", principal.hb, 36.17);
  for (let i = 0; i < 2; i++) {
    assertEq(`HB coop ${i + 1}`, principal.hbPorCoop[i], principal.aReceberPorCoop[i]);
    const liqFicha = round2(
      principal.fichas.filter((f) => f.cooperadoId === IDS[i]).reduce((s, f) => s + f.valorLiquido, 0)
    );
    assertEq(`A Receber = ficha coop ${i + 1}`, principal.aReceberPorCoop[i], liqFicha);
  }

  const dNotaFichas = round2(principal.nota.valorLiquido - principal.tot.valorLiquido);
  const dFichasAR = round2(principal.tot.valorLiquido - principal.aReceber);
  const dARHB = round2(principal.aReceber - principal.hb);
  assertEq("Δ nota/fichas", dNotaFichas, 0);
  assertEq("Δ fichas/A Receber", dFichasAR, 0);
  assertEq("Δ A Receber/HB", dARHB, 0);

  console.log("NOTA:", principal.nota.valorBruto, "/", principal.nota.valorDesconto, "/", principal.nota.valorLiquido);
  console.log("FICHAS:", principal.tot.valorBruto, "/", principal.tot.valorDesconto, "/", principal.tot.valorLiquido);
  console.log("A RECEBER:", principal.aReceber);
  console.log("HB entrada:", principal.hb);
  console.log("Δ nota/fichas:", dNotaFichas, "Δ fichas/AR:", dFichasAR, "Δ AR/HB:", dARHB);
  console.log("1–5 principal OK\n");
}

{
  const fake = { ...item("p1", "Alface", 3, 4.5), valorBruto: 999 };
  const normal = calcularItensNota([fake], 0);
  assertEq("item normal qty×preço", normal.valorBruto, 13.5);
  assert.notEqual(normal.valorBruto, 999);
  console.log("6 item normal OK — 13.50 (ignora valorBruto 999)\n");
}

for (const n of [2, 3, 4] as const) {
  const r = lancarComRateio(fotosPrincipal(), n, 10);
  assertEq(`${n} coop bruto`, r.tot.valorBruto, r.nota.valorBruto);
  assertEq(`${n} coop liquido`, r.tot.valorLiquido, r.nota.valorLiquido);
  assertEq(`${n} coop A Receber`, r.aReceber, r.nota.valorLiquido);
  assertEq(`${n} coop HB`, r.hb, r.nota.valorLiquido);
  console.log(`${n} cooperados PASS — nota/fichas/AR/HB ${r.nota.valorLiquido}`);
}

{
  const fotos = [calcularItensNota([item("x", "X", 1, 36)], 0).itens];
  const r = lancarComRateio(fotos, 2, 0);
  assertEq("divisivel 36/2 fichas", r.tot.valorLiquido, 36);
  assertEq("divisivel 36/2 AR", r.aReceber, 36);
  assertEq("divisivel 36/2 HB", r.hb, 36);
  console.log("divisível 36/2 PASS");
}

{
  for (const [label, bruto, n] of [
    ["100/2", 100, 2],
    ["100/4", 100, 4],
    ["257/2", 257, 2],
    ["257/3", 257, 3],
    ["257/4", 257, 4],
  ] as const) {
    const r = lancarComRateio([calcularItensNota([item("x", "X", 1, bruto)], 0).itens], n, 0);
    assertEq(`${label} fichas`, r.tot.valorLiquido, bruto);
    assertEq(`${label} AR`, r.aReceber, bruto);
    assertEq(`${label} HB`, r.hb, bruto);
  }
  console.log("divisível 100/257 PASS");
}

{
  const r = lancarComRateio(fotosPrincipal(), 2, 10);
  assertEq("não divisível bruto", r.tot.valorBruto, 40.19);
  assertEq("não divisível liquido", r.tot.valorLiquido, 36.17);
  console.log("não divisível 40.19/36.17 PASS");
}

{
  const fotos = [
    calcularItensNota([item("", "A", 10, 5)], 0).itens,
    calcularItensNota([item("", "B", 2, 100)], 0).itens,
    calcularItensNota([item("", "C", 1, 7)], 0).itens,
  ];
  const cons = consolidarItensLancamentoPorFoto(fotos);
  assert.equal(cons.length, 3, "IDs vazios permanecem separados");
  const r = lancarComRateio(fotos, 2, 0);
  assertEq("multi-foto vazios bruto", r.nota.valorBruto, 257);
  assertEq("multi-foto vazios fichas", r.tot.valorLiquido, 257);
  assert.notEqual(r.nota.valorBruto, 65);
  for (const n of [3, 4] as const) {
    const rn = lancarComRateio(fotos, n, 0);
    assertEq(`257 vazios / ${n}`, rn.tot.valorLiquido, 257);
  }
  console.log("multi-foto + IDs vazios PASS");
}

{
  const fotos = [
    calcularItensNota([item("p-a", "A", 10, 5), item("p-b", "B", 1, 100)], 0).itens,
    calcularItensNota([item("p-b", "B", 1, 100), item("p-c", "C", 1, 7)], 0).itens,
  ];
  const cons = consolidarItensLancamentoPorFoto(fotos);
  assert.equal(cons.length, 3, "IDs válidos agrupam (A, B somado, C)");
  const b = cons.find((i) => i.produtoInstituicaoId === "p-b");
  assert.equal(b?.quantidade, 2);
  const r = lancarComRateio(fotos, 2, 0);
  assertEq("multi-foto IDs válidos", r.nota.valorBruto, 257);
  assertEq("multi-foto IDs válidos fichas", r.tot.valorLiquido, 257);
  console.log("multi-foto + IDs válidos PASS");
}

{
  const r = lancarComRateio(fotosPrincipal(), 2, 10, [
    {
      id: "fc_old",
      cooperativaId: COOP,
      cooperadoId: "c1",
      notaPedidoId: "np_140",
      descricao: "antiga",
      valorBruto: 20,
      descontos: 2,
      valorLiquido: 18,
      saldoAcumulado: 18,
      mesReferencia: MES,
      status: "pendente",
      dataLancamento: "2026-08-01",
      dataPagamentoPrevista: "2026-08-31",
      responsavelConferencia: "Old",
      createdAt: "",
    } as FichaCorrida,
  ]);
  assertEq("H134 nota liquido", r.nota.valorLiquido, 36.17);
  assertEq("H134 nota bruto", r.nota.valorBruto, 40.19);
  console.log("H8.9.134 no fluxo integrado PASS — ficha 18 não rebaixa\n");
}

console.log("H8.9.140 — cadeia local OK (nota = fichas = A Receber = HB)");
console.log(
  JSON.stringify({
    notaBruto: principal.nota.valorBruto,
    notaDesconto: principal.nota.valorDesconto,
    notaLiquido: principal.nota.valorLiquido,
    fichasBruto: principal.tot.valorBruto,
    fichasLiquido: principal.tot.valorLiquido,
    aReceber: principal.aReceber,
    hb: principal.hb,
  })
);
