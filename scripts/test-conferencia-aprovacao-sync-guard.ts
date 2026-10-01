/**
 * Blindagem: fila pós-aprovação propaga falha (UI não deve avançar sem PATCH ok).
 * npx tsx scripts/test-conferencia-aprovacao-sync-guard.ts
 */
import assert from "node:assert/strict";
import {
  enqueueConferenciaAprovacaoSync,
  awaitConferenciaAprovacaoSyncQueueIdle,
  resetConferenciaAprovacaoSyncQueueForTests,
  getConferenciaPatchSyncedSnapshot,
  markConferenciaPatchSyncedForOperacionalPush,
} from "../src/services/conferenciaAprovacaoSyncQueue";

resetConferenciaAprovacaoSyncQueueForTests();

async function main() {
  let order: string[] = [];

  const p1 = enqueueConferenciaAprovacaoSync("n1", async () => {
    order.push("n1-start");
    await new Promise((r) => setTimeout(r, 20));
    markConferenciaPatchSyncedForOperacionalPush("n1");
    order.push("n1-end");
  });

  const p2 = enqueueConferenciaAprovacaoSync("n2", async () => {
    order.push("n2-start");
    throw new Error("patch falhou");
  });

  await Promise.allSettled([p1, p2]);
  await awaitConferenciaAprovacaoSyncQueueIdle();

  assert.deepEqual(order, ["n1-start", "n1-end", "n2-start"]);
  assert.ok(getConferenciaPatchSyncedSnapshot().has("n1"));
  assert.ok(!getConferenciaPatchSyncedSnapshot().has("n2"));

  let rejectErr: unknown;
  await enqueueConferenciaAprovacaoSync("n3", async () => {
    throw new Error("cloud offline");
  }).catch((e) => {
    rejectErr = e;
  });
  assert.ok(rejectErr instanceof Error);
  assert.match(String(rejectErr), /cloud offline/);

  console.log("test-conferencia-aprovacao-sync-guard: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
