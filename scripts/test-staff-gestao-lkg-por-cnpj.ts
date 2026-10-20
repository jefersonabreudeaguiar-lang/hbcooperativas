/**
 * Lastro do responsável é por CNPJ — coop nova não herda a casa.
 * npx tsx scripts/test-staff-gestao-lkg-por-cnpj.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyInitialData } from "../src/mock/data.ts";
import {
  noteStaffGestaoLastGood,
  peekStaffGestaoLastGood,
  preservarStaffGestaoContraWipe,
  primaryStaffGestaoCnpjFromData,
  resetStaffGestaoSnapshotGuardForTests,
} from "../src/lib/staff/staffGestaoSnapshotGuard.ts";

resetStaffGestaoSnapshotGuardForTests();

const casa = {
  ...emptyInitialData,
  cooperativas: [
    { id: "coop-casa", nome: "Casa", cnpj: "62351750000165", status: "ativa" } as never,
  ],
  cooperados: [{ id: "c1", cooperativaId: "coop-casa", nomeCompleto: "Orlando", status: "ativo" } as never],
  notasPedido: [{ id: "n1", cooperativaId: "coop-casa" } as never],
  fichaCorrida: [{ id: "f1", cooperativaId: "coop-casa", status: "pendente" } as never],
};

const nova = {
  ...emptyInitialData,
  cooperativas: [
    { id: "coop-nova", nome: "Nova", cnpj: "11222333000181", status: "ativa" } as never,
  ],
};

assert.equal(primaryStaffGestaoCnpjFromData(casa), "62351750000165");
assert.equal(primaryStaffGestaoCnpjFromData(nova), "11222333000181");

noteStaffGestaoLastGood(casa, "62351750000165");
assert.ok(peekStaffGestaoLastGood("62351750000165"), "casa tem lastro");
assert.equal(peekStaffGestaoLastGood("11222333000181"), null, "coop nova não vê lastro da casa");

const misturado = preservarStaffGestaoContraWipe(casa, nova);
assert.equal(misturado.notasPedido.length, 0, "wipe da nova não puxa notas da casa");
assert.equal(misturado.cooperados.length, 0, "wipe da nova não puxa cooperados da casa");

const guard = readFileSync(
  join(import.meta.dirname ?? __dirname, "../src/lib/staff/staffGestaoSnapshotGuard.ts"),
  "utf8"
);
assert.match(guard, /STAFF_GESTAO_LKG_SESSION_KEY}:\$\{cnpj\}/);
assert.match(guard, /migrateLegacyLastGoodIfMatches/);
assert.match(guard, /adoptLegacyLastGoodFromStore/);
assert.match(guard, /localStorage\.setItem\(key, json\)/);
assert.match(guard, /localStorage\.getItem\(key\)/);

console.log("ok: lastro do responsável isolado por CNPJ");
