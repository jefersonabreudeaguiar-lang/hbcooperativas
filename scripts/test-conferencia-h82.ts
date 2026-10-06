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
import {
  descricaoFichaCorrespondeFoto,
  fichaJaTemLancamentoFoto,
  lancamentosOrdenadosPorFoto,
  mesclarProgressoMultiFotoSessaoNaFicha,
  validarTodasFotosLancadasConferencia,
} from "../src/lib/conferencia/conferenciaFichaHydrate";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function pass(msg: string) {
  console.log("PASS:", msg);
}

const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");
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

assert.equal(
  descricaoFichaCorrespondeFoto("Nota 1 — Escola (foto 1/3)", 0, 3),
  true
);
assert.equal(
  descricaoFichaCorrespondeFoto("Nota 1 — Escola (foto 10/12)", 0, 12),
  false
);
assert.equal(
  fichaJaTemLancamentoFoto(
    [
      {
        id: "fc1",
        notaPedidoId: "n1",
        descricao: "X (foto 10/12)",
      } as never,
    ],
    "n1",
    0,
    12
  ),
  false
);
pass("tag foto na ficha sem falso positivo foto 1 vs 10");

assert.equal(validarTodasFotosLancadasConferencia(new Set([0, 1, 2]), 3).ok, true);
assert.equal(
  validarTodasFotosLancadasConferencia(new Set([0, 2]), 3).ok,
  false
);
const ord = lancamentosOrdenadosPorFoto(
  new Map([
    [0, [{ produtoInstituicaoId: "a", quantidade: 1, valorBruto: 1 } as never]],
    [2, [{ produtoInstituicaoId: "b", quantidade: 2, valorBruto: 2 } as never]],
  ]),
  3
);
assert.equal(ord.length, 3);
assert.equal(ord[2]?.[0]?.produtoInstituicaoId, "b");
pass("progresso multi-foto — ordem e validação de fotos");

const merged = mesclarProgressoMultiFotoSessaoNaFicha(
  new Set([0]),
  new Map([[0, [{ produtoInstituicaoId: "a", quantidade: 1, valorBruto: 1 } as never]]]),
  new Set([0, 1]),
  new Map([[1, [{ produtoInstituicaoId: "b", quantidade: 2, valorBruto: 2 } as never]]])
);
assert.equal(merged.lancadas.size, 2);
assert.equal(merged.lancamentosPorFoto.get(1)?.[0]?.produtoInstituicaoId, "b");
pass("progresso multi-foto — mescla ficha e sessão");

assert.ok(notas.includes("finalizarFichasConferenciaMultiFoto"), "fechamento multi-foto preserva lançamentos parciais");
assert.ok(notas.includes("reidratarProgressoMultiFotoConferencia"), "reidrata progresso da ficha");
assert.ok(notas.includes("lancamentosOrdenadosPorFoto"), "consolida itens por índice de foto");
assert.ok(notas.includes("aplicarLancamentoFotoConferenciaEmDados"), "persistência atômica multi-foto na aprovação");
assert.ok(notas.includes("persistirFotoConferenciaNaFicha(fotoIdx"), "lançamento intermediário grava na ficha");
assert.ok(notas.includes("mesclarProgressoMultiFotoSessaoNaFicha"), "sync não apaga progresso da sessão");
assert.ok(notas.includes("executarSlideshowLeveConferenciaMultiFoto"), "slideshow leve sem gate de batch pré-aprovacao");
assert.ok(notas.includes("conferenciaTemFichaParaNota"), "validação de ficha mono e multi-foto");
assert.ok(
  notas.includes("loadConferenciaFotoPrefetchModule") && notas.includes("totalFotosNota"),
  "fetch foto conferência com total de partes (chunk lazy)"
);
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
