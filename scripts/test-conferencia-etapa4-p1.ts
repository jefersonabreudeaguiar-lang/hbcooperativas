/**
 * Etapa 4 P1 — retomada draft×ficha + guard aprovar/rejeitar.
 * npx tsx scripts/test-conferencia-etapa4-p1.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConferenciaDraftMemoria } from "../src/lib/conferencia/conferenciaDraftMemoria";
import { bloquearAcaoFinalConferencia } from "../src/lib/conferencia/conferenciaAprovarGuard";
import {
  enriquecerMensagemRetomadaMultiFotoComDraft,
  progressoFotosDraftDivergeDaFicha,
} from "../src/lib/conferencia/conferenciaRetomadaMensagens";
import {
  enqueueConferenciaAprovacaoSync,
  awaitConferenciaAprovacaoSyncQueueIdle,
  resetConferenciaAprovacaoSyncQueueForTests,
} from "../src/services/conferenciaAprovacaoSyncQueue";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");

const draft: ConferenciaDraftMemoria = {
  notaId: "n1",
  updatedAt: 1,
  instId: "i",
  local: "L",
  descontoPct: 5,
  cooperadoId: "c",
  divisaoQtd: 0,
  divisaoIds: [],
  escolaAvulsa: "",
  numeroNotaManual: "",
  fotoIdx: 2,
  itens: [],
  fotosLancadas: [0, 1],
  lancamentosPorFoto: {},
};

assert.equal(progressoFotosDraftDivergeDaFicha(draft, new Set([0]), 0), true);
assert.equal(progressoFotosDraftDivergeDaFicha(draft, new Set([0, 1]), 2), false);

const enriched = enriquecerMensagemRetomadaMultiFotoComDraft(
  "2 de 3 fotos já foram lançadas.",
  draft,
  new Set([0]),
  0,
  3
);
assert.match(enriched, /ficha prevaleceu/);

assert.equal(bloquearAcaoFinalConferencia({ syncingForUi: true, pendingDeleteIds: new Set(), notaId: "n" }).blocked, true);
assert.equal(
  bloquearAcaoFinalConferencia({ syncingForUi: false, pendingDeleteIds: new Set(["n"]), notaId: "n" }).blocked,
  true
);

assert.ok(notas.includes("bloquearAcaoFinalConferencia"), "guard na aprovação/rejeição");
assert.ok(notas.includes("enriquecerMensagemRetomadaMultiFotoComDraft"), "mensagem retomada draft");
assert.ok(notas.includes("syncingForUi") && notas.includes("handleLancarNota"), "botão respeita sync");

resetConferenciaAprovacaoSyncQueueForTests();

async function main() {
  let seq = 0;
  const p1 = enqueueConferenciaAprovacaoSync("a", async () => {
    seq += 1;
    await new Promise((r) => setTimeout(r, 15));
  });
  const p2 = enqueueConferenciaAprovacaoSync("b", async () => {
    seq += 2;
  });
  await Promise.all([p1, p2]);
  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.equal(seq, 3, "fila FIFO pós-aprovação serializada");

  console.log("test-conferencia-etapa4-p1: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
