/**
 * H8.9.60 — single-flight push operacional (offline).
 * Uso: npx tsx scripts/test-operacional-push-single-flight-h860.ts
 */
import assert from "node:assert/strict";
import {
  enqueueOperacionalPush,
  isOperacionalPushSingleFlightEnabled,
  resetOperacionalPushSingleFlightForTests,
} from "../src/services/operacionalPushSingleFlight.ts";

const CNPJ_A = "62351750000165";
const CNPJ_B = "11222333000181";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function testSameCnpjSerialized() {
  resetOperacionalPushSingleFlightForTests();
  const log: string[] = [];
  let parallel = 0;
  let maxParallel = 0;

  const mk = (id: string) => () =>
    enqueueOperacionalPush(CNPJ_A, async () => {
      parallel++;
      maxParallel = Math.max(maxParallel, parallel);
      log.push(`${id}:start`);
      await delay(15);
      log.push(`${id}:end`);
      parallel--;
    });

  await Promise.all([mk("A1")(), mk("A2")(), mk("A3")()]);
  assert.equal(maxParallel, 1, "same CNPJ must not run in parallel");
  assert.deepEqual(log, ["A1:start", "A1:end", "A2:start", "A2:end", "A3:start", "A3:end"]);
  console.log("PASS — 1. mesmo CNPJ serializado (FIFO)");
}

async function testDifferentCnpjIsolated() {
  resetOperacionalPushSingleFlightForTests();
  const log: string[] = [];
  let aParallel = 0;
  let bParallel = 0;
  let maxA = 0;
  let maxB = 0;

  const runA = enqueueOperacionalPush(CNPJ_A, async () => {
    aParallel++;
    maxA = Math.max(maxA, aParallel);
    log.push("A1:start");
    await delay(40);
    log.push("A1:end");
    aParallel--;
  });

  const runB = enqueueOperacionalPush(CNPJ_B, async () => {
    bParallel++;
    maxB = Math.max(maxB, bParallel);
    log.push("B1:start");
    await delay(5);
    log.push("B1:end");
    bParallel--;
  });

  await Promise.all([runA, runB]);
  assert.equal(maxA, 1);
  assert.equal(maxB, 1);
  assert.ok(log.indexOf("B1:end") < log.indexOf("A1:end"), "B should finish before slow A");
  console.log("PASS — 2. CNPJs diferentes isolados");
}

async function testIntermediateError() {
  resetOperacionalPushSingleFlightForTests();
  const log: string[] = [];

  const p1 = enqueueOperacionalPush(CNPJ_A, async () => {
    log.push("A1");
  });

  const p2 = enqueueOperacionalPush(CNPJ_A, async () => {
    log.push("A2");
    throw new Error("fail-A2");
  });

  const p3 = enqueueOperacionalPush(CNPJ_A, async () => {
    log.push("A3");
  });

  await p1;
  await assert.rejects(p2, /fail-A2/);
  await p3;
  assert.deepEqual(log, ["A1", "A2", "A3"]);
  console.log("PASS — 4. erro intermediário não trava fila");
}

async function testCallerPromise() {
  resetOperacionalPushSingleFlightForTests();
  const p = enqueueOperacionalPush(CNPJ_A, async () => 42);
  assert.equal(await p, 42);
  console.log("PASS — 5. Promise retorna ao chamador correto");
}

async function testReentrancy() {
  resetOperacionalPushSingleFlightForTests();
  const log: string[] = [];
  let maxParallel = 0;
  let parallel = 0;

  let innerDone!: Promise<void>;
  const outerDone = enqueueOperacionalPush(CNPJ_A, async () => {
    parallel++;
    maxParallel = Math.max(maxParallel, parallel);
    log.push("outer:start");
    innerDone = enqueueOperacionalPush(CNPJ_A, async () => {
      parallel++;
      maxParallel = Math.max(maxParallel, parallel);
      log.push("inner:start");
      await delay(5);
      log.push("inner:end");
      parallel--;
    });
    await delay(15);
    log.push("outer:end");
    parallel--;
  });

  await outerDone;
  await innerDone;

  assert.equal(maxParallel, 1);
  assert.deepEqual(log, ["outer:start", "outer:end", "inner:start", "inner:end"]);
  console.log("PASS — 6. reentrância (enqueue durante execução, sem paralelo)");
}

async function testNoParallelSameCnpj() {
  resetOperacionalPushSingleFlightForTests();
  let active = 0;
  let maxActive = 0;
  const ops = Array.from({ length: 8 }, (_, i) =>
    enqueueOperacionalPush(CNPJ_A, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(8);
      active--;
      return i;
    })
  );
  const results = await Promise.all(ops);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(maxActive, 1);
  console.log("PASS — 7. nenhuma execução paralela no mesmo CNPJ");
}

async function main() {
  assert.equal(isOperacionalPushSingleFlightEnabled(), false, "flag default off");
  await testSameCnpjSerialized();
  await testDifferentCnpjIsolated();
  await testIntermediateError();
  await testCallerPromise();
  await testReentrancy();
  await testNoParallelSameCnpj();
  console.log("\n7/7 testes OK (H8.9.60 single-flight offline).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
