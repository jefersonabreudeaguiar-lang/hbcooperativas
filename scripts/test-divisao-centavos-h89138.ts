/**
 * H8.9.138 — diagnóstico read-only: perda de centavos na divisão entre cooperados.
 * Reprodução sintética do fixture H8.9.133 (Alface/Tomate/Cenoura, 10%, 2 cooperados).
 * npx tsx scripts/test-divisao-centavos-h89138.ts
 */
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichasDivisaoFromNota,
  criarDivisaoEntregaFromParticipantes,
  somaTotaisFichasNota,
} from "../src/services/notaPedidoService.ts";
import { round2 } from "../src/utils/calculations.ts";
import type { AppData, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

const COOP = "coop-138";
const IDS = ["c1", "c2", "c3", "c4"];

function round2Trace(label: string, before: number): number {
  const after = round2(before);
  if (after !== before) {
    console.log(`    round2 ${label}: ${before} → ${after} (Math.round(x*100)/100)`);
  } else {
    console.log(`    round2 ${label}: ${before} (sem mudança visível)`);
  }
  return after;
}

/** Cópia local de dividirValorEntrega para traçar (função de produção não exportada). */
function dividirValorEntregaTrace(total: number, index: number, count: number, label: string): number {
  if (count <= 1) return round2Trace(`${label} N=1`, total);
  const parte = total / count;
  if (index === count - 1) {
    const parteArred = round2(total / count);
    console.log(`    ${label} último: total=${total} / ${count} = ${parte} → round2 partes anteriores=${parteArred}`);
    const resto = total - parteArred * (count - 1);
    return round2Trace(`${label} resto último`, resto);
  }
  console.log(`    ${label} índice ${index}: ${total}/${count} = ${parte}`);
  return round2Trace(`${label} parte`, parte);
}

function itensFixture133(): NotaPedidoItem[] {
  return [
    { produtoInstituicaoId: "p1", produtoNome: "Alface", unidade: "un", precoUnitario: 4.5, quantidade: 3, valorBruto: 0 },
    { produtoInstituicaoId: "p2", produtoNome: "Tomate", unidade: "kg", precoUnitario: 8.99, quantidade: 2.333, valorBruto: 0 },
    { produtoInstituicaoId: "p3", produtoNome: "Cenoura", unidade: "kg", precoUnitario: 5.15, quantidade: 1.111, valorBruto: 0 },
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

function notaFromCalc(calc: ReturnType<typeof calcularItensNota>, pct: number): NotaPedido {
  return aplicarItensNaNota(
    {
      id: "np_138",
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
    calc.itens,
    pct
  );
}

function dividirCenario(titulo: string, itensRaw: NotaPedidoItem[], pct: number, nCoop: number) {
  console.log(`\n========== ${titulo} N=${nCoop} desc=${pct}% ==========`);
  const calcNota = calcularItensNota(itensRaw, pct);
  const nota = notaFromCalc(calcNota, pct);
  console.log(`NOTA BRUTA=${nota.valorBruto} DESCONTO=${nota.valorDesconto} LÍQUIDA=${nota.valorLiquido}`);
  console.log("ITENS ANTES DA DIVISÃO:");
  let somaSub = 0;
  let somaDescLinha = 0;
  for (const i of nota.itens) {
    const subOrig = i.quantidade * i.precoUnitario;
    const subRound = round2(i.quantidade * i.precoUnitario);
    const descLinhaAntes = i.valorBruto * (pct / 100);
    const descLinha = round2(descLinhaAntes);
    const liqLinha = round2(i.valorBruto - descLinha);
    somaSub += i.valorBruto;
    somaDescLinha += descLinha;
    console.log(
      `  ${i.produtoNome} id=${i.produtoInstituicaoId} qty=${i.quantidade} preco=${i.precoUnitario} qty×preco=${subOrig} round2=${subRound} valorBruto=${i.valorBruto} desc10% cru=${descLinhaAntes} round2=${descLinha} liqLinha=${liqLinha}`
    );
  }
  console.log(`SOMA ITENS BRUTO=${round2(somaSub)} vs NOTA ${nota.valorBruto} Δ=${round2(somaSub - nota.valorBruto)}`);
  console.log(`SOMA DESC LINHAS round2=${round2(somaDescLinha)} vs NOTA DESC ${nota.valorDesconto}`);

  console.log("\n--- dividirItensEntrega (qty e valorBruto via dividirValorEntrega) ---");
  const fatias: NotaPedidoItem[][] = [];
  for (let idx = 0; idx < nCoop; idx++) {
    console.log(`COOPERADO ${idx + 1} (index=${idx})`);
    const fatia = nota.itens.map((item) => {
      console.log(`  item ${item.produtoNome}:`);
      const qAntes = item.quantidade;
      const vAntes = item.valorBruto;
      const q = dividirValorEntregaTrace(qAntes, idx, nCoop, `qty ${item.produtoNome}`);
      const v = dividirValorEntregaTrace(vAntes, idx, nCoop, `valorBruto ${item.produtoNome}`);
      console.log(`    preco original=${item.precoUnitario} (não alterado na divisão)`);
      return { ...item, quantidade: q, valorBruto: v };
    }).filter((i) => i.quantidade > 0);
    fatias.push(fatia);
    const somaQty = fatia.reduce((s, i) => s + i.quantidade, 0);
    const somaV = fatia.reduce((s, i) => s + i.valorBruto, 0);
    console.log(`  soma qty fatia=${somaQty} soma valorBruto dividido (campo, ANTES de calcularItensNota)=${round2(somaV)}`);
  }

  console.log("\n--- conservação quantidade ---");
  for (const item of nota.itens) {
    const partes = fatias.map((f) => f.find((x) => x.produtoInstituicaoId === item.produtoInstituicaoId)?.quantidade ?? 0);
    const soma = round2(partes.reduce((s, q) => s + q, 0));
    console.log(`  ${item.produtoNome} orig=${item.quantidade} partes=[${partes.join(", ")}] soma=${soma} Δ=${round2(soma - item.quantidade)}`);
  }

  console.log("\n--- conservação preço ---");
  for (const item of nota.itens) {
    const precos = fatias.map((f) => f.find((x) => x.produtoInstituicaoId === item.produtoInstituicaoId)?.precoUnitario);
    console.log(`  ${item.produtoNome} orig=${item.precoUnitario} A/B...=${precos.join(", ")}`);
  }

  console.log("\n--- calcularItensNota SOBRE a fatia (DESCARTA valorBruto dividido; usa qty×preço) ---");
  const calcs = fatias.map((f, i) => {
    console.log(`COOPERADO ${i + 1} após calcularItensNota:`);
    for (const it of f) {
      const cru = it.quantidade * it.precoUnitario;
      const rb = round2(cru);
      const descCru = rb * (pct / 100);
      const desc = round2(descCru);
      console.log(
        `  ${it.produtoNome} qty=${it.quantidade} × preco=${it.precoUnitario} = ${cru} → round2 bruto=${rb} (campo dividido era ${it.valorBruto}) Δbruto=${round2(rb - it.valorBruto)} desc cru=${descCru} round2=${desc}`
      );
    }
    const c = calcularItensNota(f, pct);
    console.log(`  TOTAIS ficha: bruto=${c.valorBruto} desc=${c.valorDesconto} liq=${c.valorLiquido}`);
    return c;
  });

  const somaBrutoFatiaCampo = round2(fatias.flat().reduce((s, i) => s + i.valorBruto, 0));
  const somaBrutoCalc = round2(calcs.reduce((s, c) => s + c.valorBruto, 0));
  const somaDescCalc = round2(calcs.reduce((s, c) => s + c.valorDesconto, 0));
  const somaLiqCalc = round2(calcs.reduce((s, c) => s + c.valorLiquido, 0));
  console.log(`SOMA valorBruto CAMPOS após dividirItensEntrega=${somaBrutoFatiaCampo} vs nota ${nota.valorBruto} Δ=${round2(somaBrutoFatiaCampo - nota.valorBruto)}`);
  console.log(`SOMA bruto calcularItensNota=${somaBrutoCalc} vs nota ${nota.valorBruto} Δ=${round2(somaBrutoCalc - nota.valorBruto)}`);
  console.log(`SOMA desc fichas=${somaDescCalc} vs nota ${nota.valorDesconto} Δ=${round2(somaDescCalc - nota.valorDesconto)}`);
  console.log(`SOMA liq fichas=${somaLiqCalc} vs nota ${nota.valorLiquido} Δ=${round2(somaLiqCalc - nota.valorLiquido)}`);

  const d = baseData(nCoop);
  const divisao = criarDivisaoEntregaFromParticipantes(d, COOP, "c1", "Coop 1", IDS.slice(0, nCoop))!;
  const fichas = buildFichasDivisaoFromNota(d, { ...nota, divisaoEntrega: divisao }, "Resp", divisao, []);
  const tot = somaTotaisFichasNota(fichas, nota.id);
  console.log(
    `buildFichasDivisaoFromNota: liqs=[${fichas.map((f) => f.valorLiquido).join(", ")}] somaBruto=${tot.valorBruto} somaDesc=${tot.valorDesconto} somaLiq=${tot.valorLiquido}`
  );
  return { nota, tot, fichas, somaLiqCalc };
}

const ref = dividirCenario("FIXTURE H8.9.133 (sintético)", itensFixture133(), 10, 2);

console.log("\n========== MATRIZ N=2,3,4 / valores com centavos ==========");
const extras: { nome: string; itens: NotaPedidoItem[]; pct: number }[] = [
  { nome: "36,17 fixture", itens: itensFixture133(), pct: 10 },
  {
    nome: "100,01 1 item",
    itens: [{ produtoInstituicaoId: "x", produtoNome: "X", unidade: "un", precoUnitario: 100.01, quantidade: 1, valorBruto: 0 }],
    pct: 0,
  },
  {
    nome: "100,05 1 item",
    itens: [{ produtoInstituicaoId: "x", produtoNome: "X", unidade: "un", precoUnitario: 100.05, quantidade: 1, valorBruto: 0 }],
    pct: 0,
  },
  {
    nome: "257 3 linhas sem desc",
    itens: [
      { produtoInstituicaoId: "a", produtoNome: "A", unidade: "un", precoUnitario: 5, quantidade: 10, valorBruto: 0 },
      { produtoInstituicaoId: "b", produtoNome: "B", unidade: "un", precoUnitario: 100, quantidade: 2, valorBruto: 0 },
      { produtoInstituicaoId: "c", produtoNome: "C", unidade: "un", precoUnitario: 7, quantidade: 1, valorBruto: 0 },
    ],
    pct: 0,
  },
];
for (const e of extras) {
  for (const n of [2, 3, 4]) {
    const calc = calcularItensNota(e.itens, e.pct);
    const nota = notaFromCalc(calc, e.pct);
    const d = baseData(n);
    const divisao = criarDivisaoEntregaFromParticipantes(d, COOP, "c1", "Coop 1", IDS.slice(0, n))!;
    const fichas = buildFichasDivisaoFromNota(d, { ...nota, divisaoEntrega: divisao }, "Resp", divisao, []);
    const tot = somaTotaisFichasNota(fichas, nota.id);
    console.log(
      `  ${e.nome} N=${n}: notaLiq=${nota.valorLiquido} somaFichas=${tot.valorLiquido} Δ=${round2(tot.valorLiquido - nota.valorLiquido)} notaBruto=${nota.valorBruto} somaBruto=${tot.valorBruto}`
    );
  }
}

console.log("\n========== EXATAMENTE DIVISÍVEIS ==========");
for (const [nome, bruto, n] of [
  ["36/2", 36, 2],
  ["100/2", 100, 2],
  ["100/4", 100, 4],
] as const) {
  const itens: NotaPedidoItem[] = [
    { produtoInstituicaoId: "x", produtoNome: "X", unidade: "un", precoUnitario: bruto, quantidade: 1, valorBruto: 0 },
  ];
  const calc = calcularItensNota(itens, 0);
  const nota = notaFromCalc(calc, 0);
  const d = baseData(n);
  const divisao = criarDivisaoEntregaFromParticipantes(d, COOP, "c1", "Coop 1", IDS.slice(0, n))!;
  const fichas = buildFichasDivisaoFromNota(d, { ...nota, divisaoEntrega: divisao }, "Resp", divisao, []);
  const tot = somaTotaisFichasNota(fichas, nota.id);
  console.log(
    `  ${nome}: nota=${nota.valorLiquido} soma=${tot.valorLiquido} Δ=${round2(tot.valorLiquido - nota.valorLiquido)} partes=[${fichas.map((f) => f.valorLiquido).join(", ")}]`
  );
}

console.log("\n### RESUMO FIXTURE ###");
console.log(`VALOR DA NOTA LIQ=${ref.nota.valorLiquido} BRUTO=${ref.nota.valorBruto} DESC=${ref.nota.valorDesconto}`);
console.log(`SOMA FICHAS LIQ=${ref.tot.valorLiquido} BRUTO=${ref.tot.valorBruto} DESC=${ref.tot.valorDesconto}`);
console.log(`DIFERENÇA LIQ=${round2(ref.tot.valorLiquido - ref.nota.valorLiquido)}`);

if (Math.abs(ref.tot.valorBruto - ref.nota.valorBruto) > 0.001 || Math.abs(ref.tot.valorLiquido - ref.nota.valorLiquido) > 0.001) {
  console.error(
    `H8.9.138 FALHOU: esperado bruto ${ref.nota.valorBruto} liq ${ref.nota.valorLiquido}, fichas bruto ${ref.tot.valorBruto} liq ${ref.tot.valorLiquido}`
  );
  process.exit(1);
}
console.log("H8.9.138 — conservação 40.19 / 36.17 nas fichas: OK");
