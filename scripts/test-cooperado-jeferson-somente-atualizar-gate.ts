/**
 * Piloto Jeferson — só Atualizar (sem sync automático pesado).
 * npx tsx scripts/test-cooperado-jeferson-somente-atualizar-gate.ts
 */
import assert from "node:assert/strict";
import {
  COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON,
  cooperadoJefersonBloqueiaSyncAutomatico,
  isCooperadoJefersonSomenteAtualizarPilot,
  withCooperadoJefersonEntregaSyncPermitido,
} from "../src/lib/cooperado/cooperadoJefersonSomenteAtualizarPilot";
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

assert.equal(isCooperadoJefersonSomenteAtualizarPilot(orlando), false);

if (!COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON) {
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(jeferson), false);
} else {
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(jeferson), true);
  assert.equal(cooperadoJefersonBloqueiaSyncAutomatico(jeferson, {}), true);
  assert.equal(cooperadoJefersonBloqueiaSyncAutomatico(jeferson, { userInitiated: true }), false);
  assert.equal(
    withCooperadoJefersonEntregaSyncPermitido(() =>
      cooperadoJefersonBloqueiaSyncAutomatico(jeferson, { eventDriven: true })
    ),
    false
  );
}

console.log("test-cooperado-jeferson-somente-atualizar-gate: ok");
