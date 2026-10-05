/**
 * HX 8.2.2 — smoke estático + store em memória
 * npx tsx scripts/test-conferencia-draft-h82.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAllConferenciaDraftMemoriaForTests,
  clearConferenciaDraftMemoria,
  getConferenciaDraftMemoria,
  hasConferenciaDraftMemoria,
  restaurarLancamentosPorFoto,
  serializarLancamentosPorFoto,
  setConferenciaDraftMemoria,
  type ConferenciaDraftMemoria,
} from "../src/lib/conferencia/conferenciaDraftMemoria";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");

assert.ok(notas.includes("conferenciaDraftMemoria"), "NotasPedidoContent integra draft em memória");
assert.ok(notas.includes("setConferenciaDraftMemoria"), "persistência do draft na conferência");
assert.ok(notas.includes("getConferenciaDraftMemoria"), "restauração do draft na conferência");
assert.ok(notas.includes("clearConferenciaDraftMemoria"), "limpeza do draft na conferência");

clearAllConferenciaDraftMemoriaForTests();

const base: ConferenciaDraftMemoria = {
  notaId: "nota-1",
  updatedAt: 0,
  instId: "inst-1",
  local: "Sede",
  descontoPct: 5,
  cooperadoId: "coop-1",
  divisaoQtd: 0,
  divisaoIds: [],
  escolaAvulsa: "",
  numeroNotaManual: "",
  fotoIdx: 0,
  itens: [
    {
      produtoInstituicaoId: "p1",
      produtoNome: "Banana",
      unidade: "kg",
      precoUnitario: 3,
      quantidade: 10,
    },
  ],
  fotosLancadas: [0],
  lancamentosPorFoto: { 0: [{ produtoInstituicaoId: "p1", quantidade: 10, valorBruto: 30 }] as never },
};

setConferenciaDraftMemoria(base);
assert.equal(hasConferenciaDraftMemoria("nota-1"), true);
assert.equal(getConferenciaDraftMemoria("nota-1")?.itens[0]?.quantidade, 10);

const map = new Map<number, { produtoInstituicaoId: string }[]>([[1, [{ produtoInstituicaoId: "x" }]]]);
const ser = serializarLancamentosPorFoto(map as never);
const back = restaurarLancamentosPorFoto(ser as never);
assert.equal(back.get(1)?.[0]?.produtoInstituicaoId, "x");

clearConferenciaDraftMemoria("nota-1");
assert.equal(hasConferenciaDraftMemoria("nota-1"), false);

console.log("HX 8.2.2 conferencia draft memoria OK (ver também scripts/test-conferencia-h82.ts)");
