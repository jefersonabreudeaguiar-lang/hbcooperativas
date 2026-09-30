/**
 * H8.9.62 — integração single-flight no writer (offline, mock de rede).
 * Uso: npx tsx scripts/test-operacional-push-integracao-h862.ts
 */
import assert from "node:assert/strict";
import type { AppData, Cooperativa, FichaCorrida } from "../src/types/index.ts";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  markOperationalResetCloudPending,
  OPERATIONAL_RESET_CLOUD_KEY,
} from "../src/services/operationalReset.ts";
import {
  resetOperacionalPushSingleFlightForTests,
  setOperacionalPushSingleFlightEnabledForTests,
} from "../src/services/operacionalPushSingleFlight.ts";
import { setSecureApiFetchTestOverrideForTests } from "../src/lib/security/clientSession.ts";
import { saveDataSafe } from "../src/services/dataStore.ts";
import {
  pushOperacionalToCloud,
  clearOperacionalPushFingerprint,
  setPushOperacionalInternalTestEnterHookForTests,
} from "../src/services/cooperativaSyncCloudService.ts";

const CNPJ_A = "62351750000165";
const CNPJ_B = "11222333000181";
const COOP_A = "coop-h862-a";
const COOP_B = "coop-h862-b";

type ApiCall = { url: string; init?: RequestInit };

let apiCalls: ApiCall[] = [];
let operacionalGetPayload: Record<string, unknown> | null = null;
let operacionalPostDelayMs = 0;
let operacionalPostShouldThrow: string | null = null;
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
  apiCalls.push({ url, init });

  if (url.includes("/api/cooperativa-sync?") && (!init?.method || init.method === "GET")) {
    return new Response(
      JSON.stringify({
        configured: true,
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

  if (url === "/api/cooperativa-sync" && init?.method === "POST") {
    const body = parseBody(init);
    if (isOperacionalPost(body) && !isResetOperacionalPost(body)) {
      operacionalPostCount++;
      if (operacionalPostShouldThrow) {
        const err = operacionalPostShouldThrow;
        operacionalPostShouldThrow = null;
        throw new Error(err);
      }
      if (operacionalPostDelayMs > 0) await delay(operacionalPostDelayMs);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (isResetOperacionalPost(body)) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "unmocked" }), { status: 404 });
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
    cooperadoId: "c_h862",
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
  operacionalPostShouldThrow = null;
  operacionalGetPayload = null;
  resetOperacionalPushSingleFlightForTests();
  setPushOperacionalInternalTestEnterHookForTests(null);
  setOperacionalPushSingleFlightEnabledForTests(null);
  setSecureApiFetchTestOverrideForTests(mockSecureApiFetch);
  clearOperacionalPushFingerprint(CNPJ_A, true);
  clearOperacionalPushFingerprint(CNPJ_A, false);
  clearOperacionalPushFingerprint(CNPJ_B, true);
  clearOperacionalPushFingerprint(CNPJ_B, false);
}

async function pushDefaults(
  cnpj: string,
  cooperativaId: string,
  extra?: Parameters<typeof pushOperacionalToCloud>[3],
  fichaIds = ["fc_h862_1"]
) {
  const d = appData(cnpj, cooperativaId, fichaIds);
  saveDataSafe(d);
  return pushOperacionalToCloud(cnpj, d, cooperativaId, {
    forceOperacionalPush: true,
    authoritative: true,
    skipOperationalResetPush: true,
    ...extra,
  });
}

async function testSameCnpjTwoCalls() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    log.push("enter");
    await delay(20);
  });
  await Promise.all([pushDefaults(CNPJ_A, COOP_A), pushDefaults(CNPJ_A, COOP_A)]);
  assert.equal(log.length, 2);
  assert.deepEqual(log, ["enter", "enter"]);
  console.log("PASS — 1. duas chamadas mesmo CNPJ (serializadas via fila)");
}

async function testFifo() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  let n = 0;
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    const id = ++n;
    log.push(`${id}:start`);
    await delay(8);
    log.push(`${id}:end`);
  });
  await Promise.all([
    pushDefaults(CNPJ_A, COOP_A),
    pushDefaults(CNPJ_A, COOP_A),
    pushDefaults(CNPJ_A, COOP_A),
  ]);
  assert.deepEqual(log, ["1:start", "1:end", "2:start", "2:end", "3:start", "3:end"]);
  console.log("PASS — 2. FIFO");
}

async function testMaxParallelOne() {
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
  await Promise.all([pushDefaults(CNPJ_A, COOP_A), pushDefaults(CNPJ_A, COOP_A)]);
  assert.equal(maxParallel, 1);
  console.log("PASS — 3. maxParallel = 1");
}

async function testTwoCnpjParallel() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  setPushOperacionalInternalTestEnterHookForTests(async ({ cnpj }) => {
    log.push(`${cnpj}:start`);
    await delay(cnpj === CNPJ_A ? 30 : 5);
    log.push(`${cnpj}:end`);
  });
  await Promise.all([pushDefaults(CNPJ_A, COOP_A), pushDefaults(CNPJ_B, COOP_B)]);
  assert.ok(log.indexOf(`${CNPJ_B}:end`) < log.indexOf(`${CNPJ_A}:end`));
  console.log("PASS — 4. dois CNPJs em paralelo");
}

async function testIntermediateError() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  let n = 0;
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    n++;
    log.push(`A${n}`);
    if (n === 2) throw new Error("fail-A2");
  });
  const p1 = pushDefaults(CNPJ_A, COOP_A);
  const p2 = pushDefaults(CNPJ_A, COOP_A);
  const p3 = pushDefaults(CNPJ_A, COOP_A);
  await p1;
  await assert.rejects(p2, /fail-A2/);
  await p3;
  assert.deepEqual(log, ["A1", "A2", "A3"]);
  console.log("PASS — 5. erro intermediário (fila não trava)");
}

async function testReentrancy() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  const log: string[] = [];
  let maxParallel = 0;
  let parallel = 0;
  let innerDone!: Promise<void>;

  setPushOperacionalInternalTestEnterHookForTests(async ({ cnpj }) => {
    if (log.length === 0) {
      parallel++;
      maxParallel = Math.max(maxParallel, parallel);
      log.push("outer:start");
      innerDone = pushOperacionalToCloud(cnpj, appData(cnpj, COOP_A, ["fc_re"]), COOP_A, {
        forceOperacionalPush: true,
        authoritative: true,
        skipOperationalResetPush: true,
      });
      await delay(15);
      log.push("outer:end");
      parallel--;
      return;
    }
    parallel++;
    maxParallel = Math.max(maxParallel, parallel);
    log.push("inner:start");
    await delay(5);
    log.push("inner:end");
    parallel--;
  });

  await pushDefaults(CNPJ_A, COOP_A);
  await innerDone;
  assert.equal(maxParallel, 1);
  assert.deepEqual(log, ["outer:start", "outer:end", "inner:start", "inner:end"]);
  console.log("PASS — 6. reentrância");
}

async function testDedupeAA() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  setPushOperacionalInternalTestEnterHookForTests(async () => delay(2));
  const d = appData(CNPJ_A, COOP_A, ["fc_dedupe"]);
  saveDataSafe(d);
  await pushOperacionalToCloud(CNPJ_A, d, COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  await pushOperacionalToCloud(CNPJ_A, d, COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 1, "dedupe A+A → 1 POST");
  console.log("PASS — 7. dedupe A+A");
}

async function testDedupeAB() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  setPushOperacionalInternalTestEnterHookForTests(async () => delay(2));
  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc_a"]));
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_a"]), COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc_b"]));
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_b"]), COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 2, "dedupe A+B → 2 POST");
  console.log("PASS — 8. dedupe A+B");
}

async function testAuthoritativeTruePosts() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  operacionalGetPayload = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    fichaCorrida: Array.from({ length: 40 }, (_, i) => ficha(`cloud_${i}`, COOP_A)),
    config: { descontoPadraoCooperativa: 0 },
  };
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_local"]), COOP_A, {
    authoritative: false,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 0, "merge + operacionalPushSeguro aborta sem authoritative");

  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  operacionalGetPayload = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    fichaCorrida: Array.from({ length: 40 }, (_, i) => ficha(`cloud_${i}`, COOP_A)),
    config: { descontoPadraoCooperativa: 0 },
  };
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_local"]), COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 1, "authoritative true → POST");
  console.log("PASS — 9. authoritative true/false");
}

async function testForceOperacionalPush() {
  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(true);
  operacionalGetPayload = {
    updatedAt: "2026-01-01T00:00:00.000Z",
    fullReset: true,
    arquivosMensais: [],
    pagamentosCooperado: [],
    comunicados: [],
    mensalidades: [],
    descontos: [],
    fichaCorrida: [],
    config: { descontoPadraoCooperativa: 0 },
  };
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_x"]), COOP_A, {
    authoritative: true,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 0, "restore lock bloqueia sem force");

  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_x"]), COOP_A, {
    authoritative: true,
    forceOperacionalPush: true,
    skipOperationalResetPush: true,
  });
  assert.equal(operacionalPostCount, 1, "forceOperacionalPush ignora restore lock");
  console.log("PASS — 10. forceOperacionalPush");
}

async function testSkipOperationalResetPush() {
  resetHarness();
  markOperationalResetCloudPending();
  assert.equal(globalThis.localStorage.getItem(OPERATIONAL_RESET_CLOUD_KEY), "pending");

  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc_skip"]));
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_skip"]), COOP_A, {
    forceOperacionalPush: true,
    authoritative: true,
    skipOperationalResetPush: true,
  });
  const resetPostsSkip = apiCalls.filter((c) => isResetOperacionalPost(parseBody(c.init)));
  assert.equal(resetPostsSkip.length, 0, "skipOperationalResetPush → sem reset POST");

  resetHarness();
  markOperationalResetCloudPending();
  setOperacionalPushSingleFlightEnabledForTests(false);
  saveDataSafe(appData(CNPJ_A, COOP_A, ["fc_skip2"]));
  await pushOperacionalToCloud(CNPJ_A, appData(CNPJ_A, COOP_A, ["fc_skip2"]), COOP_A, {
    forceOperacionalPush: true,
    authoritative: true,
  });
  const resetPostsNoSkip = apiCalls.filter((c) => isResetOperacionalPost(parseBody(c.init)));
  assert.ok(resetPostsNoSkip.length >= 1, "sem skip → reset POST");

  console.log("PASS — 11. skipOperationalResetPush");

  resetHarness();
  setOperacionalPushSingleFlightEnabledForTests(false);
  let maxParallel = 0;
  let parallel = 0;
  setPushOperacionalInternalTestEnterHookForTests(async () => {
    parallel++;
    maxParallel = Math.max(maxParallel, parallel);
    await delay(25);
    parallel--;
  });
  await Promise.all([pushDefaults(CNPJ_A, COOP_A), pushDefaults(CNPJ_A, COOP_A)]);
  assert.ok(maxParallel >= 2, "flag false → legado sem single-flight");
  console.log("PASS — flag FALSE (legado)");
}

async function main() {
  await testSameCnpjTwoCalls();
  await testFifo();
  await testMaxParallelOne();
  await testTwoCnpjParallel();
  await testIntermediateError();
  await testReentrancy();
  await testDedupeAA();
  await testDedupeAB();
  await testAuthoritativeTruePosts();
  await testForceOperacionalPush();
  await testSkipOperationalResetPush();
  console.log("\n11/11 testes OK (H8.9.62 integração single-flight).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
