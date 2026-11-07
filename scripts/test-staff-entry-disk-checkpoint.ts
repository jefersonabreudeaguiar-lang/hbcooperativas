import assert from "node:assert/strict";
import vm from "node:vm";
import { emptyInitialData } from "../src/mock/data";
import { saveDataSafe, getDataOperationalTruth } from "../src/services/dataStore";
import { prepararDadosLocaisEntradaStaff } from "../src/services/staffEntradaAtualizadaService";
import { resetStaffGestaoSnapshotGuardForTests } from "../src/lib/staff/staffGestaoSnapshotGuard";
import type { AppData } from "../src/types";
import { buildInlineCooperadoAppDataWarmScript } from "../src/lib/performance/cooperadoAppDataInlineWarm";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); },
    clear: () => values.clear(), key: (i: number) => [...values.keys()][i] ?? null, get length() { return values.size; } };
}
const disk = storage(), sessionDisk = storage();
Object.assign(globalThis, { localStorage: disk, sessionStorage: sessionDisk, window: {
  localStorage: disk, sessionStorage: sessionDisk, addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: true }), location: { pathname: "/comunicados" },
} });
const cnpj = "88888888000181", coopId = "fixture-coop";
disk.setItem("coopeagriplla_session", JSON.stringify({ id: "fixture-user", name: "Fixture", email: "fixture@example.invalid",
  role: "responsavel", cooperativaId: coopId, cooperativaCnpj: cnpj, active: true }));
const old = { ...emptyInitialData, cooperativas: [{ id: coopId, cnpj, nome: "Fixture", status: "ativa" }],
  cooperados: [{ id: "member", cooperativaId: coopId, nomeCompleto: "Synthetic", status: "ativo" }],
  comunicados: [{ id: "notice", cooperativaId: coopId, titulo: "Cópia antiga", descricao: "Antiga", createdAt: "2026-11-07T00:00:00Z" }],
} as AppData;
resetStaffGestaoSnapshotGuardForTests();
assert.equal(saveDataSafe(old).ok, true);
assert.equal(getDataOperationalTruth().comunicados[0].titulo, "Cópia antiga");
const pending = { ...old,
  comunicados: [{ ...old.comunicados[0], titulo: "Rascunho B", descricao: "Edição ainda não confirmada" }],
  operacionalCheckpoint: { scope: `${cnpj}:fixture-user`, id: "checkpoint-before-edit" },
  comunicadosPublicacaoPendente: { [coopId]: { token: "edit-generation", ids: ["notice"] } },
};
// Simulate a cold first paint from older last-good data while the full scoped file is newer.
disk.setItem(`coopeagriplla_data:${cnpj}`, JSON.stringify(pending));
const loaded = prepararDadosLocaisEntradaStaff();
assert.equal(loaded.comunicados[0].titulo, "Rascunho B", "Cloud entry must start with the actual persisted pending copy");
assert.deepEqual(loaded.operacionalCheckpoint, pending.operacionalCheckpoint);
assert.deepEqual(loaded.comunicadosPublicacaoPendente, pending.comunicadosPublicacaoPendente);
assert.equal(disk.getItem("coopeagriplla_data"), null, "Staff must not read or create the global member blob");
for (const role of ["responsavel", "tesoureiro", "admin", "contador"]) {
  let globalReads = 0, sessionReads = 0;
  vm.runInNewContext(buildInlineCooperadoAppDataWarmScript(), {
    window: { location: { pathname: "/dashboard" }, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem(key: string) {
      if (key === "coopeagriplla_session") { sessionReads++; return JSON.stringify({ role, cooperativaCnpj: cnpj }); }
      if (key === "coopeagriplla_data") globalReads++;
      return null;
    } },
  });
  assert.ok(sessionReads > 0);
  assert.equal(globalReads, 0, `${role}: inline warm must not use the unrelated global blob`);
}
console.log("PASS: cold staff entry reads scoped disk before cloud and preserves draft/checkpoint/outbox over stale first-paint memory.");
