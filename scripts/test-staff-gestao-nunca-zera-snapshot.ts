/**
 * Responsável: persistir snapshot vazio nunca apaga cadastro/notas/fichas/PIX.
 * npx tsx scripts/test-staff-gestao-nunca-zera-snapshot.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  deveAdiarReconciliarFichaAposLimpezaCacheStaff,
  resetStaffOperacionalColdHydrateForTests,
} from "../src/lib/staff/staffOperacionalColdHydrate.ts";
import {
  medirRiquezaStaffGestao,
  preservarStaffGestaoContraWipe,
  resetStaffGestaoSnapshotGuardForTests,
  staffGestaoSnapshotPoorer,
} from "../src/lib/staff/staffGestaoSnapshotGuard.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

resetStaffGestaoSnapshotGuardForTests();
resetStaffOperacionalColdHydrateForTests();

const rico = {
  ...emptyInitialData,
  cooperados: [{ id: "c1", cooperativaId: "coop1", nomeCompleto: "A", status: "ativo" } as never],
  notasPedido: [{ id: "n1", cooperativaId: "coop1" } as never],
  fichaCorrida: Array.from({ length: 20 }, (_, i) => ({
    id: `f${i}`,
    cooperativaId: "coop1",
    status: "pendente",
  })),
  pagamentosCooperado: [{ id: "p1", cooperativaId: "coop1", status: "confirmado" } as never],
  livroCaixa: [{ id: "l1", cooperativaId: "coop1" } as never],
};

const vazio = { ...emptyInitialData };

assert.equal(staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(vazio), medirRiquezaStaffGestao(rico)), true);
assert.equal(staffGestaoSnapshotPoorer(medirRiquezaStaffGestao(rico), medirRiquezaStaffGestao(vazio)), false);

const salvo = preservarStaffGestaoContraWipe(rico, vazio);
assert.equal(salvo.cooperados.length, 1, "não zera cooperados");
assert.equal(salvo.notasPedido.length, 1, "não zera notas");
assert.equal(salvo.fichaCorrida.length, 20, "não zera fichas");
assert.equal(salvo.pagamentosCooperado.length, 1, "não zera PIX");
assert.equal(salvo.livroCaixa.length, 1, "não zera livro");

const comPixNovo = {
  ...vazio,
  pagamentosCooperado: [
    { id: "p1", cooperativaId: "coop1", status: "confirmado" } as never,
    { id: "p2", cooperativaId: "coop1", status: "confirmado" } as never,
  ],
};
const fundido = preservarStaffGestaoContraWipe(rico, comPixNovo);
assert.ok(fundido.fichaCorrida.length >= 20);
assert.ok(fundido.pagamentosCooperado.some((p) => p.id === "p2"));

resetStaffOperacionalColdHydrateForTests();
assert.equal(
  deveAdiarReconciliarFichaAposLimpezaCacheStaff(rico as never, "coop1"),
  false,
  "com ficha local não esconde o painel"
);

const store = readFileSync(join(ROOT, "src/services/dataStore.ts"), "utf8");
assert.ok(store.includes("applyStaffGestaoWipeGuard"), "saveDataSafe recusa wipe");
assert.ok(store.includes("restoreStaffGestaoFromLastGoodIfNeeded"), "F5 reaplica lastro se o blob veio pobre");
assert.ok(store.includes("persistedAppDataBlobLooksHydrated"), "F5 detecta blob local rico");

const guard = readFileSync(join(ROOT, "src/lib/staff/staffGestaoSnapshotGuard.ts"), "utf8");
assert.ok(guard.includes("hb-staff-gestao-lkg-v1"), "lastro sobrevive F5 no sessionStorage");

const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
assert.ok(provider.includes("refreshData()"), "sync staff relê localStorage se a memória veio vazia");

console.log("OK — test-staff-gestao-nunca-zera-snapshot");
