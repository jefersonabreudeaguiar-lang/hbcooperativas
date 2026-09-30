/**
 * H8.9.88 — coordenação push ↔ bidirectional (offline, mocks).
 * Uso: npx tsx scripts/test-operacional-coordination-h888.ts
 */
import assert from "node:assert/strict";
import type { AppData, Cooperativa, FichaCorrida } from "../src/types/index.ts";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  markOperationalResetCloudPending,
  OPERATIONAL_RESET_CLOUD_KEY,
  needsOperationalResetCloudPush,
} from "../src/services/operationalReset.ts";
import {
  enqueueOperacionalCoordination,
  resetOperacionalPushSingleFlightForTests,
  setOperacionalPushSingleFlightEnabledForTests,
} from "../src/services/operacionalPushSingleFlight.ts";
import { setSecureApiFetchTestOverrideForTests } from "../src/lib/security/clientSession.ts";
import { saveDataSafe } from "../src/services/dataStore.ts";
import {
  pushOperacionalToCloud,
  syncCooperativaBidirectional,
  clearOperacionalPushFingerprint,
  setPushOperacionalInternalTestEnterHookForTests,
  setPushOperacionalPublicTestEnterHookForTests,
} from "../src/services/cooperativaSyncCloudService.ts";

const CNPJ_A = "62351750000165";
const CNPJ_B = "11222333000181";
const COOP_A = "coop-h888-a";
const COOP_B = "coop-h888-b";

type ApiCall = { url: string; init?: RequestInit };

let apiCalls: ApiCall[] = [];
let operacionalGetPayload: Record<string, unknown> | null = null;
let operacionalPostDelayMs = 0;
let operacionalPostCount = 0;

function parseBody(init?: RequestInit): Record<string, unknown> | null {
  if (!init?.body || typeof init.body !== "string") return null;
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isOperacionalPost(body: Record<string, unknown> | null): boolean {
  return body?.section === "operacional" && body?.payload != null;
}

function isResetOperacionalPost(body: Record<string, unknown> | null): boolean {
  const payload = body?.payload as { fullReset?: boolean; operationalResetVersion?: number } | undefined;
  return isOperacionalPost(body) && payload?.fullReset === true && payload?.operationalResetVersion != null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function mockSecureApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method ?? "GET";
  apiCalls.push({ url, init });

  if (url.includes("/api/cooperativa-sync?") && method === "GET") {
    return new Response(
      JSON.stringify({
        configured: true,
        contratos: null,
        operacional: operacionalGetPayload ?? {
          updatedAt: "2026-01-01T00:00:00.000Z",
          arquivosMensais: [],
          pagamentosCooperado: [],
          comunicados: [],
          mensalidades: [],
          descontos: [],
          fichaCorrida: [],
          config: { descontoPadraoCooperativa: 0 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  if (url === "/api/cooperativa-sync" && method === "POST") {
    const body = parseBody(init);
    if (isResetOperacionalPost(body)) {
      const { markOperationalResetCloudDone } = await import("../src/services/operationalReset.ts");
      markOperationalResetCloudDone();
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
    if (isOperacionalPost(body)) {
      operacionalPostCount++;
      if (operacionalPostDelayMs > 0) await delay(operacionalPostDelayMs);
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }
  }

  if (url.includes("/api/cooperativas/") && method === "GET") {
    return new Response(JSON.stringify({ configured: false }), { status: 404 });
  }

  if (url.includes("/api/cooperados") && method === "GET") {
    return new Response(JSON.stringify({ cooperados: [] }), { status: 200 });
  }

  if (url.includes("/api/notas") && method === "GET") {
    return new Response(JSON.stringify({ notas: [], configured: true }), { status: 200 });
  }

  if (url.includes("/api/notas") && method === "POST") {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ configured: false }), { status: 200 });
}

setSecureApiFetchTestOverrideForTests(mockSecureApiFetch);

const dataStore = new Map<string, string>();

function ensureBrowserLikeEnvForDataStore(): void {
  const g = globalThis as typeof globalThis & { window?: Window };
  if (g.window?.localStorage) return;
  g.window = {
    localStorage: {
      getItem: (k: string) => dataStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        dataStore.set(k, v);
      },
      removeItem: (k: string) => {
        dataStore.delete(k);
      },
      clear: () => dataStore.clear(),
      length: dataStore.size,
      key: () => null,
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window;
  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = g.window.localStorage;
}

function coop(id: string, cnpj: string): Cooperativa {
  return {
    id,
    cnpj,
    nome: "Coop Test",
    endereco: "",
    telefone: "",
    responsavel: "Resp",
    email: "t@test.com",
    mensalidadeConfig: { valor: 0, diaVencimento: 1 },
  };
}

function ficha(id: string, cooperativaId: string): FichaCorrida {
  return {
    id,
    cooperativaId,
    cooperadoId: "c_h888",
    notaPedidoId: `np_${id}`,
    descricao: id,
    valorBruto: 10,
    descontos: 0,
    valorLiquido: 10,
    saldoAcumulado: 10,
    mesReferencia: "2026-08",
    status: "pendente",
    dataLancamento: "2026-08-01",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function appData(cnpj: string, cooperativaId: string, fichaIds: string[]): AppData {
  return {
    ...emptyInitialData,
    cooperativas: [coop(cooperativaId, cnpj)],
    cooperados: [],
    fichaCorrida: fichaIds.map((id) => ficha(id, cooperativaId)),
    pagamentosCooperado: [],
    mensalidades: [],
    arquivosMensais: [],
  };
}

function resetHarness() {
  ensureBrowserLikeEnvForDataStore();
  dataStore.clear();
  apiCalls = [];
  operacionalPostCount = 0;
  operacionalPostDelayMs = 0;
  operacionalGetPayload = null;
  resetOperacionalPushSingleFlightForTests();
  setPushOperacionalInternalTestEnterHookForTests(null);
  setPushOperacionalPublicTestEnterHookForTests(null);
  setOperacionalPushSingleFlightEnabledForTests(null);
  clearOperacionalPushFingerprint(CNPJ_A, true);
  clearOperacionalPushFingerprint(CNPJ_A, false);
  clearOperacionalPushFingerprint(CNPJ_B, true);
  clearOperacionalPushFingerprint(CNPJ_B, false);
}

async function pushQuick(cnpj: string, cooperativaId: string) {
  const d = appData(cnpj, cooperativaId, ["fc_h888"]);
  saveDataSafe(d);
  await pushOperacionalToCloud(cnpj, d, cooperativaId, {
    forceOperacionalPush: true,
    authoritative: true,
    skipOperationalResetPush: true,
  });
}

async function bidirectionalQuick(cnpj: string, cooperativaId: string) {
  saveDataSafe(appData(cnpj, cooperativaId, ["fc_h888"]));
  await syncCooperativaBidirectional(cnpj, cooperativaId, { pushCatalog: false, pushMensalidades: true });
}

async function testA_pushPush() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    log.push("p");
    await delay(5);
  });
  await Promise.all([pushQuick(CNPJ_A, COOP_A), pushQuick(CNPJ_A, COOP_A)]);
  assert.equal(log.length, 2);
  console.log("PASS — A push → push");
}

async function testB_pushBidirectional() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    log.push("internal");
    await delay(25);
  });
  const pPush = pushQuick(CNPJ_A, COOP_A);
  await delay(5);
  const pBio = bidirectionalQuick(CNPJ_A, COOP_A);
  await Promise.all([pPush, pBio]);
  const firstInternal = log.indexOf("internal");
  assert.ok(firstInternal >= 0);
  assert.ok(log.filter((x) => x === "internal").length >= 2);
  console.log("PASS — B push → bidirectional");
}

async function testC_bidirectionalPush() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    log.push("job");
    await delay(8);
  });
  await bidirectionalQuick(CNPJ_A, COOP_A);
  await pushQuick(CNPJ_A, COOP_A);
  assert.ok(log.length >= 2);
  console.log("PASS — C bidirectional → push");
}

async function testD_resetPush() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  markOperationalResetCloudPending();
  assert.equal(needsOperationalResetCloudPush(), true);
  saveDataSafe(appData(CNPJ_A, COOP_A, []));
  await syncCooperativaBidirectional(CNPJ_A, COOP_A, { pushCatalog: false, pushMensalidades: true });
  assert.equal(needsOperationalResetCloudPush(), false);
  const resetIdx = apiCalls.findIndex(
    (c) => c.init?.method === "POST" && isResetOperacionalPost(parseBody(c.init))
  );
  assert.ok(resetIdx >= 0);
  console.log("PASS — D reset → push (mesmo job coordenado)");
}

async function testE_pushSimulatedAppSyncBidirectional() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  operacionalPostDelayMs = 15;
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    log.push("push-phase");
    await delay(10);
  });
  const pPush = pushQuick(CNPJ_A, COOP_A);
  await delay(2);
  const pBio = bidirectionalQuick(CNPJ_A, COOP_A);
  await Promise.all([pPush, pBio]);
  assert.deepEqual(log.slice(0, 2), ["push-phase", "push-phase"]);
  console.log("PASS — E push → requestAppSync simulado → bidirectional");
}

async function testF_twoBidirectional() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  let parallel = 0;
  let maxParallel = 0;
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    parallel++;
    maxParallel = Math.max(maxParallel, parallel);
    await delay(12);
    parallel--;
  });
  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc1"]));
  await Promise.all([
    syncCooperativaBidirectional(CNPJ_A, COOP_A, { pushCatalog: false }),
    syncCooperativaBidirectional(CNPJ_A, COOP_A, { pushCatalog: false }),
  ]);
  assert.equal(maxParallel, 1);
  console.log("PASS — F dois bidirectional mesmo CNPJ");
}

async function testG_errorThenNext() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  let n = 0;
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    n++;
    if (n === 1) throw new Error("fail-first");
  });
  await assert.rejects(pushQuick(CNPJ_A, COOP_A), /fail-first/);
  await pushQuick(CNPJ_A, COOP_A);
  console.log("PASS — G erro no primeiro job, segundo executa");
}

async function testH_twoCnpj() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async ({ cnpj }) => {
    log.push(`${cnpj}:start`);
    await delay(cnpj === CNPJ_A ? 25 : 5);
    log.push(`${cnpj}:end`);
  });
  await Promise.all([pushQuick(CNPJ_A, COOP_A), pushQuick(CNPJ_B, COOP_B)]);
  assert.ok(log.indexOf(`${CNPJ_B}:end`) < log.indexOf(`${CNPJ_A}:end`));
  console.log("PASS — H dois CNPJs simultâneos");
}

async function testI_bidirectionalNoPublicPush() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  let publicCalls = 0;
  setPushOperacionalPublicTestEnterHookForTests(() => {
    publicCalls++;
  });
  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc_i"]));
  await syncCooperativaBidirectional(CNPJ_A, COOP_A, { pushCatalog: false, pushMensalidades: true });
  assert.equal(publicCalls, 0);
  console.log("PASS — I bidirectional NÃO chama pushOperacionalToCloud público");
}

async function testJ_noNestedEnqueueAwaitDeadlock() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  let innerDone!: Promise<void>;
  const outer = enqueueOperacionalCoordination(CNPJ_A, async () => {
    await delay(5);
    innerDone = enqueueOperacionalCoordination(CNPJ_A, async () => {
      await delay(5);
    });
    await delay(20);
  });
  await Promise.race([
    (async () => {
      await outer;
      await innerDone;
    })(),
    delay(3000).then(() => {
      throw new Error("deadlock-timeout");
    }),
  ]);
  console.log("PASS — J reentrância enqueue sem await interno (H8.9.60 compat)");
}

async function main() {
  await testA_pushPush();
  await testB_pushBidirectional();
  await testC_bidirectionalPush();
  await testD_resetPush();
  await testE_pushSimulatedAppSyncBidirectional();
  await testF_twoBidirectional();
  await testG_errorThenNext();
  await testH_twoCnpj();
  await testI_bidirectionalNoPublicPush();
  await testJ_noNestedEnqueueAwaitDeadlock();
  console.log("\n10/10 testes OK (H8.9.88 coordenação offline).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
