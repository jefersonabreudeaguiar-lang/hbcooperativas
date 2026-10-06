/**
 * Etapa 4 P2 — chunk lazy modal, PATCH compartilhado, rejeição na fila FIFO.
 * npx tsx scripts/test-conferencia-etapa4-p2.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  enqueueConferenciaAprovacaoSync,
  enqueueConferenciaRejeicaoSync,
  awaitConferenciaAprovacaoSyncQueueIdle,
  resetConferenciaAprovacaoSyncQueueForTests,
} from "../src/services/conferenciaAprovacaoSyncQueue";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");
const patchTask = readFileSync(join(ROOT, "src/services/conferenciaPatchCloudTask.ts"), "utf8");
const nuvemSync = readFileSync(join(ROOT, "src/services/conferenciaDecisaoNuvemSync.ts"), "utf8");
const prefetch = readFileSync(join(ROOT, "src/lib/performance/prefetchConferenciaModalUi.ts"), "utf8");

assert.ok(patchTask.includes("patchNotaDecisaoConferenciaNaNuvem"), "PATCH compartilhado");
assert.ok(nuvemSync.includes("patchNotaDecisaoConferenciaNaNuvem"), "sync nuvem usa PATCH compartilhado");
assert.ok(notas.includes("scheduleConferenciaAprovacaoNuvemSync"), "NotasPedido agenda sync nuvem na aprovação");
assert.ok(notas.includes("scheduleConferenciaRejeicaoNuvemSync"), "NotasPedido agenda sync nuvem na rejeição");
assert.ok(notas.includes('import("@/components/notas/NotasPedidoConferirItensTable")'), "tabela itens lazy");
assert.ok(notas.includes('import("@/components/ui/FotoLightbox")'), "lightbox conferência lazy");
assert.ok(notas.includes("prefetchConferenciaModalUiChunks"), "prefetch UI conferência");
assert.ok(prefetch.includes("NotasPedidoConferirItensTable"), "prefetch tabela");

const rejectIdx = notas.indexOf("scheduleConferenciaRejeicaoNuvemSync({");
const rejectBlock = notas.slice(rejectIdx, rejectIdx + 2200);
assert.ok(
  rejectBlock.includes("prepararConferenciaNota(proxima") && !rejectBlock.includes("await patchNotaPedidoInCloud"),
  "rejeição avança fila sem await PATCH inline"
);

resetConferenciaAprovacaoSyncQueueForTests();
assert.equal(enqueueConferenciaRejeicaoSync, enqueueConferenciaAprovacaoSync, "alias mesma fila");

async function main() {
  let n = 0;
  await enqueueConferenciaAprovacaoSync("x", async () => {
    n += 1;
  });
  await enqueueConferenciaRejeicaoSync("y", async () => {
    n += 10;
  });
  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.equal(n, 11);
  console.log("test-conferencia-etapa4-p2: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
