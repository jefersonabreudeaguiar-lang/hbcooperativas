/**
 * HX 8.0 — AppScheduler + syncRequest tiers
 * npx tsx scripts/test-app-scheduler-h80.ts
 */
import assert from "node:assert/strict";
import {
  enqueueAppSyncRequest,
  registerAppSchedulerSyncDispatch,
  resetAppSchedulerForTests,
  setDeferSyncDuringInteraction,
} from "../src/lib/performance/appScheduler.ts";
import { mergeSyncTierRequests } from "../src/lib/performance/syncTier.ts";
import {
  registerSyncHandler,
  requestAppSync,
  requestAppSyncImmediate,
  requestAppSyncLight,
  requestSyncTier,
} from "../src/services/syncRequest.ts";

function installBrowserShim() {
  (globalThis as { document?: { hidden: boolean } }).document = { hidden: false };
  (globalThis as { navigator?: { onLine: boolean } }).navigator = { onLine: true };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function testMergeTiers() {
  const a = mergeSyncTierRequests(
    { tier: "pulse", force: false },
    { tier: "operacional_full", force: true }
  );
  assert.equal(a.tier, "operacional_full");
  assert.equal(a.force, true);

  const b = mergeSyncTierRequests(
    { tier: "operacional_full", force: true },
    { tier: "pulse", force: false }
  );
  assert.equal(b.tier, "operacional_full");
  assert.equal(b.force, true);
  console.log("PASS — merge tiers + force");
}

async function testDebounceCoalescesForce() {
  resetAppSchedulerForTests();
  installBrowserShim();
  const calls: boolean[] = [];
  registerAppSchedulerSyncDispatch((force) => calls.push(force));

  enqueueAppSyncRequest({ tier: "pulse", force: false });
  enqueueAppSyncRequest({ tier: "operacional_full", force: true });
  await delay(500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], true);
  console.log("PASS — debounce coalesce force:true");
}

async function testImmediateBypassesDebounce() {
  resetAppSchedulerForTests();
  installBrowserShim();
  const calls: boolean[] = [];
  registerAppSchedulerSyncDispatch((force) => calls.push(force));

  enqueueAppSyncRequest({ tier: "pulse", force: false });
  enqueueAppSyncRequest({ tier: "operacional_full", force: true, immediate: true });
  await delay(10);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], true);
  console.log("PASS — immediate bypass debounce");
}

async function testSyncRequestWrappers() {
  resetAppSchedulerForTests();
  installBrowserShim();
  const calls: boolean[] = [];
  registerSyncHandler((opts) => calls.push(Boolean(opts.force)));

  requestAppSyncLight();
  await delay(500);
  assert.deepEqual(calls, [false]);

  requestAppSync();
  await delay(500);
  assert.deepEqual(calls, [false, true]);

  requestAppSyncImmediate();
  await delay(10);
  assert.deepEqual(calls, [false, true, true]);

  requestSyncTier("financeiro_delta", { force: false });
  await delay(500);
  assert.equal(calls.length, 4);
  assert.equal(calls[3], false);
  console.log("PASS — syncRequest wrappers preservam force");
}

async function testDeferOptIn() {
  resetAppSchedulerForTests();
  installBrowserShim();
  setDeferSyncDuringInteraction(true);
  const calls: number[] = [];
  registerAppSchedulerSyncDispatch(() => calls.push(Date.now()));

  enqueueAppSyncRequest({ tier: "pulse", force: false, immediate: true });
  await delay(5);
  assert.equal(calls.length, 1, "immediate ignora defer");

  const deferredCalls: number[] = [];
  resetAppSchedulerForTests();
  installBrowserShim();
  setDeferSyncDuringInteraction(true);
  registerAppSchedulerSyncDispatch(() => deferredCalls.push(Date.now()));
  enqueueAppSyncRequest({ tier: "pulse", force: false });
  await delay(20);
  assert.equal(deferredCalls.length, 0, "debounce + defer: ainda sem dispatch");
  await delay(500);
  assert.equal(deferredCalls.length, 1, "após debounce e quiet window");
  console.log("PASS — defer opt-in (immediate preservado)");
}

async function main() {
  testMergeTiers();
  await testDebounceCoalescesForce();
  await testImmediateBypassesDebounce();
  await testSyncRequestWrappers();
  await testDeferOptIn();
  console.log("\nHX 8.0 AppScheduler testes OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
