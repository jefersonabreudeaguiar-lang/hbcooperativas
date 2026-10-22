/**
 * Hint + revisão null — orquestração pullOperacionalAfterCooperadoLancamentoHint (mocks, sem rede).
 * npx tsx scripts/test-cooperado-hint-operacional-sync-v539.ts
 */
import assert from "node:assert/strict";
import type { User } from "../src/types/index.ts";
import type { CooperativaCloudRevision } from "../src/lib/performance/cooperadoEventDrivenSync.ts";
import {
  COOPERADO_HINT_LIGHT_PULL_FALLBACK_COOLDOWN_MS,
  pullOperacionalAfterCooperadoLancamentoHint,
  resetCooperadoHintOperacionalSyncForTests,
  type CooperadoHintOperacionalSyncDeps,
} from "../src/lib/cooperado/cooperadoStaffHintOperacionalSync.ts";

const CNPJ = "62351750000165";
const COOP = "coop-hint";
const USER = {
  id: "u1",
  role: "cooperado" as const,
  cooperadoId: "c1",
  cooperativaId: COOP,
  nome: "T",
  email: "t@test",
} satisfies Omit<User, "password">;

const REMOTE: CooperativaCloudRevision = {
  operacionalUpdatedAt: "2026-10-01T12:00:00.000Z",
  operationalResetVersion: 1,
  contratosUpdatedAt: null,
  notasUpdatedAt: "2026-10-01T11:00:00.000Z",
};

function makeDeps(overrides: Partial<CooperadoHintOperacionalSyncDeps>): CooperadoHintOperacionalSyncDeps {
  return {
    watchRevision: async () => null,
    runLightPull: async () => true,
    syncLightFromCloud: async () => {},
    materializeSnapshots: () => {},
    persistRevisionApplied: () => {},
    requestStaffRevisionSync: () => {},
    sleep: async () => {},
    ...overrides,
  };
}

async function main(): Promise<void> {
resetCooperadoHintOperacionalSyncForTests();

// 1. Revisão válida — caminho existente (light pull com remote).
{
  let lightPulls = 0;
  let syncDirect = 0;
  const deps = makeDeps({
    watchRevision: async () => REMOTE,
    runLightPull: async () => {
      lightPulls += 1;
      return true;
    },
    syncLightFromCloud: async () => {
      syncDirect += 1;
    },
  });
  const out = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(out.status, "synced");
  assert.equal(lightPulls, 1);
  assert.equal(syncDirect, 0);
}

resetCooperadoHintOperacionalSyncForTests();

// 2. Revisão null transitória — pull sem revisão prévia, depois revisão OK.
{
  let watchCalls = 0;
  let syncDirect = 0;
  const deps = makeDeps({
    watchRevision: async () => {
      watchCalls += 1;
      if (watchCalls <= 3) return null;
      return REMOTE;
    },
    syncLightFromCloud: async () => {
      syncDirect += 1;
    },
    runLightPull: async () => {
      throw new Error("não deve usar light pull wrapper sem remote inicial");
    },
    persistRevisionApplied: (cnpj, remote) => {
      assert.equal(cnpj.replace(/\D/g, ""), CNPJ);
      assert.equal(remote.operacionalUpdatedAt, REMOTE.operacionalUpdatedAt);
    },
  });
  const out = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(out.status, "synced");
  assert.equal(syncDirect, 1);
  assert.ok(watchCalls >= 4);
}

resetCooperadoHintOperacionalSyncForTests();

// 3. Revisão sempre null — delega full no máximo uma vez por janela; sem falso synced.
{
  let staffFull = 0;
  let syncDirect = 0;
  const deps = makeDeps({
    watchRevision: async () => null,
    syncLightFromCloud: async () => {
      syncDirect += 1;
    },
    runLightPull: async () => true,
    requestStaffRevisionSync: () => {
      staffFull += 1;
    },
  });
  const a = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  const b = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(a.status, "delegated_operacional_full");
  assert.equal(b.status, "retry");
  assert.equal(staffFull, 1);
  assert.equal(syncDirect, 1);
}

resetCooperadoHintOperacionalSyncForTests();

// 4. Falha no pull — hint não seria marcado (status retry).
{
  const deps = makeDeps({
    watchRevision: async () => null,
    syncLightFromCloud: async () => {
      throw new Error("rede");
    },
  });
  const out = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(out.status, "retry");
}

resetCooperadoHintOperacionalSyncForTests();

// 4b. Light pull com remote retorna false.
{
  const deps = makeDeps({
    watchRevision: async () => REMOTE,
    runLightPull: async () => false,
  });
  const out = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(out.status, "retry");
}

resetCooperadoHintOperacionalSyncForTests();

// 5. Concorrência — um único syncLightFromCloud para mesma chave.
{
  let syncDirect = 0;
  let resolveSync!: () => void;
  const syncGate = new Promise<void>((r) => {
    resolveSync = r;
  });
  const deps = makeDeps({
    watchRevision: async () => null,
    syncLightFromCloud: async () => {
      syncDirect += 1;
      await syncGate;
    },
    sleep: async () => {},
  });
  const p1 = pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  const p2 = pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(syncDirect, 1);
  resolveSync();
  const [o1, o2] = await Promise.all([p1, p2]);
  assert.equal(syncDirect, 1);
  const statuses = new Set([o1.status, o2.status]);
  assert.ok(statuses.has("delegated_operacional_full"));
  assert.ok(statuses.has("retry"));
}

resetCooperadoHintOperacionalSyncForTests();

// 6. Revisão permanentemente null — poll 4s não repete light pull dentro do cooldown.
{
  let t = 0;
  let syncDirect = 0;
  const deps = makeDeps({
    now: () => t,
    watchRevision: async () => null,
    syncLightFromCloud: async () => {
      syncDirect += 1;
    },
    requestStaffRevisionSync: () => {},
  });
  const first = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(syncDirect, 1);
  assert.equal(first.status, "delegated_operacional_full");
  t += 4_000;
  const second = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(second.status, "retry");
  assert.equal(syncDirect, 1);
  t += COOPERADO_HINT_LIGHT_PULL_FALLBACK_COOLDOWN_MS;
  const third = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(syncDirect, 2);
  assert.equal(third.status, "retry");
}

resetCooperadoHintOperacionalSyncForTests();

// 7. Revisão volta durante cooldown — recuperação sem segundo syncLightFromCloud.
{
  let t = 0;
  let syncDirect = 0;
  let lightPull = 0;
  let revisionPhase = 0;
  const deps = makeDeps({
    now: () => t,
    watchRevision: async () => (revisionPhase === 0 ? null : REMOTE),
    syncLightFromCloud: async () => {
      syncDirect += 1;
    },
    runLightPull: async () => {
      lightPull += 1;
      return true;
    },
    requestStaffRevisionSync: () => {},
  });
  const first = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(first.status, "delegated_operacional_full");
  assert.equal(syncDirect, 1);
  revisionPhase = 1;
  t += 4_000;
  const recovered = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(recovered.status, "synced");
  assert.equal(syncDirect, 1);
  assert.equal(lightPull, 1);
}

resetCooperadoHintOperacionalSyncForTests();

// 8. Falha no pull marca cooldown — não repete sync a cada hint.
{
  let t = 0;
  let syncDirect = 0;
  const deps = makeDeps({
    now: () => t,
    watchRevision: async () => null,
    syncLightFromCloud: async () => {
      syncDirect += 1;
      throw new Error("falha");
    },
  });
  const first = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(first.status, "retry");
  assert.equal(syncDirect, 1);
  t += 4_000;
  const second = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(syncDirect, 1);
  assert.ok(second.status === "retry" || second.status === "delegated_operacional_full");
}

resetCooperadoHintOperacionalSyncForTests();

// 9. Hint não consumido — persist só após synced com revisão real.
{
  let persistCalls = 0;
  const deps = makeDeps({
    watchRevision: async () => null,
    syncLightFromCloud: async () => {},
    persistRevisionApplied: () => {
      persistCalls += 1;
    },
    requestStaffRevisionSync: () => {},
  });
  const out = await pullOperacionalAfterCooperadoLancamentoHint(
    { cnpj: CNPJ, cooperativaId: COOP, user: USER },
    deps
  );
  assert.equal(out.status, "delegated_operacional_full");
  assert.equal(persistCalls, 0);
}

console.log("OK test-cooperado-hint-operacional-sync-v539.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
