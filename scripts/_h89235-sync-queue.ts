/**
 * H8.9.235 — Fila de sync pós-aprovação (in-memory).
 * npx tsx scripts/_h89235-sync-queue.ts
 */
import assert from "node:assert/strict";
import {
  enqueueConferenciaAprovacaoSync,
  awaitConferenciaAprovacaoSyncQueueIdle,
  resetConferenciaAprovacaoSyncQueueForTests,
} from "../src/services/conferenciaAprovacaoSyncQueue.ts";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testOrderABC() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const log: string[] = [];
  let active = 0;
  let maxActive = 0;

  const mk = (id: string, delayMs: number, fail?: boolean) => {
    enqueueConferenciaAprovacaoSync(id, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      log.push(`${id}:start`);
      await sleep(delayMs);
      if (fail) throw new Error(`fail-${id}`);
      log.push(`${id}:end`);
      active -= 1;
    });
  };

  const uiReturnedAt = Date.now();
  mk("A", 60);
  mk("B", 10);
  mk("C", 40);
  const uiElapsed = Date.now() - uiReturnedAt;

  assert.ok(uiElapsed < 30, "enqueue deve retornar imediatamente");
  assert.equal(maxActive, 0, "nenhuma execução síncrona no enqueue");

  await awaitConferenciaAprovacaoSyncQueueIdle();
  await sleep(5);

  assert.equal(maxActive, 1, "no máximo uma sync ativa por vez");
  assert.deepEqual(log, ["A:start", "A:end", "B:start", "B:end", "C:start", "C:end"]);
}

async function testFailureDoesNotBlockQueue() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const log: string[] = [];

  enqueueConferenciaAprovacaoSync("A", async () => {
    log.push("A:start");
    throw new Error("A-fail");
  });
  enqueueConferenciaAprovacaoSync("B", async () => {
    log.push("B:ok");
  });
  enqueueConferenciaAprovacaoSync("C", async () => {
    log.push("C:ok");
  });

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.deepEqual(log, ["A:start", "B:ok", "C:ok"]);
}

async function testPatchIdentityModel() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const patches: { id: string; status: string }[] = [];

  const snapshotA = { id: "n-a", status: "conferida" as const };
  const snapshotB = { id: "n-b", status: "conferida" as const };

  enqueueConferenciaAprovacaoSync("n-a", async () => {
    await sleep(50);
    patches.push({ ...snapshotA });
  });
  enqueueConferenciaAprovacaoSync("n-b", async () => {
    patches.push({ ...snapshotB });
  });

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.equal(patches.length, 2);
  assert.equal(patches[0].id, "n-a");
  assert.equal(patches[1].id, "n-b");
}

async function testSlowAFastB() {
  resetConferenciaAprovacaoSyncQueueForTests();
  const order: string[] = [];

  enqueueConferenciaAprovacaoSync("A", async () => {
    order.push("A");
    await sleep(80);
  });
  enqueueConferenciaAprovacaoSync("B", async () => {
    order.push("B");
    await sleep(5);
  });
  enqueueConferenciaAprovacaoSync("C", async () => {
    order.push("C");
    await sleep(30);
  });

  await awaitConferenciaAprovacaoSyncQueueIdle();
  assert.deepEqual(order, ["A", "B", "C"]);
}

async function main() {
  await testOrderABC();
  await testFailureDoesNotBlockQueue();
  await testPatchIdentityModel();
  await testSlowAFastB();
  console.log("h89235-sync-queue — OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
