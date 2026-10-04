/**
 * HX 8.2 — smoke conferência (guard, draft em memória, carga de fotos)
 * npx tsx scripts/test-conferencia-h82.ts
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
import {
  responsavelBloquearNavegacaoConferencia,
  responsavelPreservarAbaDuranteSync,
} from "../src/lib/conferencia/responsavelConferenciaNavigateGuard";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function pass(msg: string) {
  console.log("PASS:", msg);
}

const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"), "utf8");
const guard = readFileSync(join(ROOT, "src/lib/conferencia/responsavelConferenciaNavigateGuard.ts"), "utf8");

assert.ok(guard.includes("syncingForUi"), "guard documenta syncingForUi");
assert.equal(
  responsavelPreservarAbaDuranteSync({
    syncingForUi: true,
    vistaCooperado: true,
    temFiltroOuAba: true,
  }),
  true
);
assert.equal(
  responsavelPreservarAbaDuranteSync({
    syncingForUi: false,
    vistaCooperado: true,
    temFiltroOuAba: true,
  }),
  false
);
pass("navigate guard — preservar aba durante sync");

assert.equal(
  responsavelBloquearNavegacaoConferencia({
    syncingForUi: true,
    conferirModal: true,
    lancando: false,
  }),
  true
);
assert.equal(
  responsavelBloquearNavegacaoConferencia({
    syncingForUi: true,
    conferirModal: false,
    lancando: true,
  }),
  true
);
pass("navigate guard — bloqueio modal/lançamento");

assert.ok(notas.includes("responsavelPreservarAbaDuranteSync"), "NotasPedido usa preservar aba");
assert.ok(notas.includes("responsavelBloquearNavegacaoConferencia"), "NotasPedido usa bloquear navegação");
assert.ok(notas.includes("syncingForUi"), "NotasPedido conferência usa syncingForUi");
pass("NotasPedido integra navigate guard");

assert.ok(notas.includes("conferenciaDraftMemoria"), "NotasPedido integra draft em memória");
assert.ok(notas.includes("setConferenciaDraftMemoria"), "persistência do draft");
assert.ok(notas.includes("getConferenciaDraftMemoria"), "restauração do draft");
assert.ok(notas.includes("clearConferenciaDraftMemoria"), "limpeza do draft");
assert.ok(notas.includes("aplicarDraftConferenciaSeExistir"), "aplica draft ao preparar nota");
pass("NotasPedido integra draft 8.2");

assert.ok(notas.includes("partCount: totalFotosNota"), "fetch foto conferência com partCount");
assert.ok(notas.includes("setConferenciaFotoCarregando(true)"), "spinner ao trocar foto");
pass("carga de fotos na conferência");

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
  fotoIdx: 1,
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
assert.equal(getConferenciaDraftMemoria("nota-1")?.fotoIdx, 1);

const map = new Map<number, { produtoInstituicaoId: string }[]>([[1, [{ produtoInstituicaoId: "x" }]]]);
const ser = serializarLancamentosPorFoto(map as never);
const back = restaurarLancamentosPorFoto(ser as never);
assert.equal(back.get(1)?.[0]?.produtoInstituicaoId, "x");

clearConferenciaDraftMemoria("nota-1");
assert.equal(hasConferenciaDraftMemoria("nota-1"), false);
pass("store draft em memória");

console.log("\nHX 8.2 conferência smoke OK");
