/**
 * H8.9.135 — conservação multi-foto 257 (H8.9.136: não pode colapsar para 65).
 * npx tsx scripts/test-multifoto-consolidacao-h89135.ts
 */
import {
  calcularItensNota,
  aplicarItensNaNota,
  buildFichaFromNota,
  consolidarItensLancamentoPorFoto,
} from "../src/services/notaPedidoService.ts";
import type { AppData, NotaPedido, NotaPedidoItem } from "../src/types/index.ts";

type Item = NotaPedidoItem;

function lineOrig(i: Item): number {
  return i.quantidade * i.precoUnitario;
}

function item(
  nome: string,
  qty: number,
  preco: number,
  id: string,
  extra?: Partial<Item>
): Item {
  return {
    produtoInstituicaoId: id,
    produtoNome: nome,
    unidade: "un",
    precoUnitario: preco,
    quantidade: qty,
    valorBruto: 0,
    ...extra,
  };
}

function dumpItem(prefix: string, i: Item, orig?: number) {
  const o = orig ?? lineOrig(i);
  console.log(
    `  ${prefix} nome=${JSON.stringify(i.produtoNome)} id=${JSON.stringify(i.produtoInstituicaoId)} qty=${i.quantidade} preco=${i.precoUnitario} subtotalOriginal=${o} valorBrutoCampo=${i.valorBruto}`
  );
}

function somaOriginal(itens: Item[]): number {
  return itens.reduce((s, i) => s + lineOrig(i), 0);
}

function somaCampo(itens: Item[]): number {
  return itens.reduce((s, i) => s + (i.valorBruto ?? 0), 0);
}

/** Replica o agrupamento de consolidarItensLancamentoPorFoto só para inspeção. */
function explicarGrupos(listas: Item[][]) {
  const grupos = new Map<string, Item[]>();
  listas.forEach((lista, fotoIndex) => {
    lista.forEach((it, itemIndex) => {
      if (it.quantidade <= 0) return;
      const id = it.produtoInstituicaoId == null ? "" : String(it.produtoInstituicaoId).trim();
      const key = id ? `id:${id}` : `occ:${fotoIndex}:${itemIndex}`;
      const arr = grupos.get(key) ?? [];
      arr.push(it);
      grupos.set(key, arr);
    });
  });
  console.log("\n--- grupos (mesma chave da consolidação: id válido ou ocorrência) ---");
  for (const [chave, membros] of grupos) {
    const qty = membros.reduce((s, i) => s + i.quantidade, 0);
    const orig = membros.reduce((s, i) => s + lineOrig(i), 0);
    const precos = membros.map((i) => i.precoUnitario);
    const precoEscolhido = membros[0].precoUnitario;
    const recalc = qty * precoEscolhido;
    console.log(`  chave=${JSON.stringify(chave)} nItens=${membros.length}`);
    for (const m of membros) dumpItem("   •", m);
    console.log(`    qtyTotal=${qty}`);
    console.log(`    precosOriginais=[${precos.join(", ")}]`);
    console.log(`    precoEscolhido=${precoEscolhido} (regra: spread ...prev no 1º item do grupo; precoUnitario NÃO é atualizado)`);
    console.log(`    valorOriginalGrupo=${orig}`);
    console.log(`    valorRecalc qty×preco1º=${recalc}`);
    console.log(`    diferençaGrupo=${recalc - orig}`);
  }
}

function pipelineNota(itensConsolidados: Item[], descontoPct: number) {
  const calc = calcularItensNota(itensConsolidados, descontoPct);
  const nota: NotaPedido = aplicarItensNaNota(
    {
      id: "np_h89135",
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
    itensConsolidados,
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
  return { calc, nota, ficha };
}

let conservacaoFalhou = false;
function checkConservacao(label: string, antes: number, depois: number, etapa: string) {
  const d = depois - antes;
  const ok = Math.abs(d) <= 0.005;
  console.log(
    `  CONSERVAÇÃO ${ok ? "OK" : "FALHOU"} [${label}] ${antes} → ${depois} Δ=${d} etapa=${etapa}`
  );
  if (!ok) conservacaoFalhou = true;
}

function caso(letra: string, titulo: string, listas: Item[][]) {
  console.log(`\n======== CASO ${letra}: ${titulo} ========`);
  listas = listas.map((foto) => calcularItensNota(foto, 0).itens);
  const flats = listas.flat();
  const orig = somaOriginal(flats);
  listas.forEach((foto, idx) => {
    console.log(`FOTO ${idx + 1}`);
    foto.forEach((i, j) => dumpItem(`  item${j + 1}`, i));
    console.log(`  subtotal foto=${somaOriginal(foto)}`);
  });
  console.log(`SUMA ORIGINAL DAS FOTOS=${orig}`);
  explicarGrupos(listas);
  const cons = consolidarItensLancamentoPorFoto(listas);
  console.log("DEPOIS consolidarItensLancamentoPorFoto:");
  cons.forEach((i, j) => dumpItem(`  cons${j + 1}`, i));
  console.log(`  soma valorBruto campos=${somaCampo(cons)} nItens=${cons.length}`);
  const { calc, nota, ficha } = pipelineNota(cons, 0);
  console.log(`  calcularItensNota bruto=${calc.valorBruto} liq=${calc.valorLiquido}`);
  console.log(`  nota.valorBruto=${nota.valorBruto} nota.valorLiquido=${nota.valorLiquido}`);
  console.log(`  ficha.valorBruto=${ficha.valorBruto} ficha.valorLiquido=${ficha.valorLiquido}`);
  console.log(`VALOR ORIGINAL=${orig}`);
  console.log(`VALOR APÓS CONSOLIDAÇÃO (campos valorBruto)=${somaCampo(cons)}`);
  console.log(`VALOR APÓS calcularItensNota=${calc.valorBruto}`);
  console.log(`DIFERENÇA consolidação vs original=${somaCampo(cons) - orig}`);
  console.log(`DIFERENÇA calc vs original=${calc.valorBruto - orig}`);
  checkConservacao(`caso ${letra} consolidar.valorBruto`, orig, somaCampo(cons), "consolidarItensLancamentoPorFoto");
  checkConservacao(`caso ${letra} calcularItensNota`, orig, calc.valorBruto, "calcularItensNota(itensConsolidados)");
  return { orig, consBruto: somaCampo(cons), calcBruto: calc.valorBruto, cons, calc, nota, ficha };
}

console.log("=== H8.9.135 fixture 257→65 (H8.9.133) ===\n");

const foto1raw = [
  item("A", 10, 5, ""),
  item("B", 2, 100, ""),
];
const foto2raw = [item("C", 1, 7, "")];
const foto1 = calcularItensNota(foto1raw, 0).itens;
const foto2 = calcularItensNota(foto2raw, 0).itens;

console.log("FOTO 1 (após calcularItensNota da foto, como no lançamento por foto)");
foto1.forEach((i, j) => dumpItem(`item${j + 1}`, i, lineOrig(foto1raw[j])));
console.log(`  subtotal foto1 original=${somaOriginal(foto1raw)} campo=${somaCampo(foto1)}`);
console.log("FOTO 2");
foto2.forEach((i, j) => dumpItem(`item${j + 1}`, i, lineOrig(foto2raw[j])));
console.log(`  subtotal foto2 original=${somaOriginal(foto2raw)} campo=${somaCampo(foto2)}`);
const somaFotos = somaOriginal(foto1raw) + somaOriginal(foto2raw);
console.log(`SUMA DOS VALORES ORIGINAIS DAS FOTOS=${somaFotos}`);

explicarGrupos([foto1, foto2]);

const cons257 = consolidarItensLancamentoPorFoto([foto1, foto2]);
console.log("\nANTES DA CONSOLIDAÇÃO: itens=", foto1.length + foto2.length, "valor=", somaFotos);
console.log("DEPOIS DA CONSOLIDAÇÃO (função, antes de recalc):");
cons257.forEach((i, j) => dumpItem(`cons${j + 1}`, i));
console.log(`  nItens=${cons257.length}`);
console.log(`PREÇO ORIGINAL ITEM A=${foto1raw[0].precoUnitario}`);
console.log(`PREÇO ORIGINAL ITEM B=${foto1raw[1].precoUnitario}`);
console.log(`PREÇO ORIGINAL ITEM C=${foto2raw[0].precoUnitario}`);
console.log(`PREÇOS NO CONSOLIDADO=[${cons257.map((i) => i.precoUnitario).join(", ")}]`);

const pipe = pipelineNota(cons257, 0);
console.log("\nCadeia até a ficha (desconto 0% para isolar a perda):");
console.log(`  consolidar.valorBruto campo=${somaCampo(cons257)}`);
console.log(`  calcularItensNota.valorBruto=${pipe.calc.valorBruto}`);
console.log(`  nota.valorBruto=${pipe.nota.valorBruto} valorLiquido=${pipe.nota.valorLiquido}`);
console.log(`  ficha.valorBruto=${pipe.ficha.valorBruto} valorLiquido=${pipe.ficha.valorLiquido}`);

checkConservacao("257 consolidar.valorBruto", somaFotos, somaCampo(cons257), "consolidarItensLancamentoPorFoto");
checkConservacao("257 calcularItensNota", somaFotos, pipe.calc.valorBruto, "calcularItensNota");
checkConservacao("257 nota", somaFotos, pipe.nota.valorBruto, "aplicarItensNaNota");
checkConservacao("257 ficha", somaFotos, pipe.ficha.valorBruto, "buildFichaFromNota");

console.log("\nVALOR INICIAL:", somaFotos);
console.log("VALOR APÓS CONSOLIDAÇÃO (campo):", somaCampo(cons257));
console.log("VALOR APÓS calcularItensNota / nota / ficha:", pipe.calc.valorBruto);
console.log("PERDA:", somaFotos - pipe.calc.valorBruto);

caso("A", "dois itens mesmo produtoInstituicaoId válido", [
  [item("Alface", 10, 5, "p1")],
  [item("Alface", 3, 5, "p1")],
]);
caso("B", "dois itens produtoInstituicaoId vazio", [
  [item("A", 10, 5, "")],
  [item("B", 2, 100, "")],
]);
caso("C", "um ID válido + um sem ID", [
  [item("Alface", 10, 5, "p1"), item("Avulso", 2, 100, "")],
]);
caso("D", "dois sem ID, preços diferentes", [
  [item("A", 10, 5, ""), item("B", 2, 100, "")],
]);
caso("E", "dois sem ID, mesma qty, preços diferentes", [
  [item("A", 2, 5, ""), item("B", 2, 100, "")],
]);
caso("F", "mesmos itens em fotos diferentes, IDs válidos distintos", [
  calcularItensNota([item("Alface", 10, 4.5, "p1")], 0).itens,
  calcularItensNota([item("Tomate", 1, 8.99, "p2")], 0).itens,
]);

console.log("\n=== H8.9.135 fim ===");
if (conservacaoFalhou) {
  console.error("\nCONSERVAÇÃO: FALHOU — 257 não se manteve até calcularItensNota/nota/ficha.");
  process.exit(1);
}
if (Math.abs(pipe.calc.valorBruto - 257) > 0.005 || cons257.length !== 3) {
  console.error(`\nASSERT 257: esperado bruto 257 e 3 itens, obtido bruto=${pipe.calc.valorBruto} n=${cons257.length}`);
  process.exit(1);
}
console.log("CONSERVAÇÃO: 257 permanece 257 após consolidar + calcularItensNota + nota + ficha.");
