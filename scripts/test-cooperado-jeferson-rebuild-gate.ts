/**
 * Contrato piloto rebuild Jeferson.
 * npx tsx scripts/test-cooperado-jeferson-rebuild-gate.ts
 */
import assert from "node:assert/strict";
import {
  COOPERADO_JEFERSON_REBUILD_MODE_ON,
  cooperadoJefersonRebuildTabHabilitada,
  cooperadoJefersonRebuildUsarConteudoLegado,
  isCooperadoJefersonRebuildPilot,
} from "../src/lib/cooperado/cooperadoJefersonRebuildPilot";
import { COOPERADO_MOBILE_PILOT_COOPERADO_ID } from "../src/lib/cooperado/cooperadoMobilePilot";

const jeferson = {
  id: "u1",
  email: "jefersonabreudeaguiar@gmail.com",
  name: "Jeferson",
  role: "cooperado" as const,
  cooperadoId: COOPERADO_MOBILE_PILOT_COOPERADO_ID,
  active: true,
};

const orlando = {
  id: "u2",
  email: "o@test",
  name: "Orlando",
  role: "cooperado" as const,
  cooperadoId: "c_1782263929381_ncp55",
  active: true,
};

assert.equal(isCooperadoJefersonRebuildPilot(orlando), false);

if (!COOPERADO_JEFERSON_REBUILD_MODE_ON) {
  assert.equal(isCooperadoJefersonRebuildPilot(jeferson), false);
  assert.equal(cooperadoJefersonRebuildUsarConteudoLegado("inicio", jeferson), true);
} else {
  assert.equal(isCooperadoJefersonRebuildPilot(jeferson), true);
  assert.equal(cooperadoJefersonRebuildTabHabilitada("inicio", jeferson), true);
  assert.equal(cooperadoJefersonRebuildTabHabilitada("entregas", jeferson), true);
  assert.equal(cooperadoJefersonRebuildTabHabilitada("precos", jeferson), false);
  assert.equal(cooperadoJefersonRebuildUsarConteudoLegado("inicio", jeferson), true);
  assert.equal(cooperadoJefersonRebuildUsarConteudoLegado("entregas", jeferson), true);
  assert.equal(cooperadoJefersonRebuildUsarConteudoLegado("precos", jeferson), false);
}

console.log("test-cooperado-jeferson-rebuild-gate: ok");
