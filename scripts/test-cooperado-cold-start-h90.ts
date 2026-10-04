/**
 * HX 9.0 — smoke estático (sem browser)
 * npx tsx scripts/test-cooperado-cold-start-h90.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const cold = read("src/lib/performance/cooperadoColdStart.ts");
const sync = read("src/services/syncRequest.ts");
const provider = read("src/components/sync/CooperativaSyncProvider.tsx");
const gate = read("src/components/cooperado/CooperadoFinanceiroGate.tsx");
const auth = read("src/modules/auth/AuthProvider.tsx");
const dash = read("src/app/(app)/dashboard/page.tsx");

assert(cold.includes("scheduleCooperadoColdStartSync"), "coordinator cold start");
assert(cold.includes("markNextCooperadoSyncSilent"), "marcador silent no coordinator");
assert(cold.includes("scheduleCooperadoPostInteractiveTask"), "post-interactive deploy defer");
const deployGuard = read("src/components/pwa/ClientDeploymentGuard.tsx");
assert(deployGuard.includes("scheduleCooperadoPostInteractiveTask"), "ClientDeploymentGuard defer");
assert(sync.includes("markCooperadoUserSyncVisible"), "sync visível só com ação do usuário");
assert(sync.includes("takePendingCooperadoSilentSync"), "silent flag no dispatch");
assert(provider.includes("syncingForUi"), "contexto syncingForUi");
assert(provider.includes("scheduleCooperadoColdStartSync"), "provider agenda sync único");
assert(gate.includes("shouldSkipCooperadoSecondaryMountSync"), "gate dedupe sync mount");
assert(gate.includes("syncingForUi"), "gate usa syncingForUi");
assert(auth.includes("ensureCooperadoAppDataEagerWarm"), "auth eager warm");
assert(dash.includes("cooperadoInstant"), "dashboard não bloqueia com resume local");

const persist = read("src/lib/cooperadoInicioCardPersistencia.ts");
assert(persist.includes("45 * 24"), "cache abertura ampliado (45d)");

if (process.exitCode !== 1) {
  console.log("\nHX 9.0 cold start smoke OK");
}
