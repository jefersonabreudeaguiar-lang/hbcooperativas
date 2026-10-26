/**
 * Contrato: gate piloto Cooperado v2 (Orlando).
 * npx tsx scripts/test-cooperado-v2-pilot-gate.ts
 */
import assert from "node:assert/strict";
import {
  COOPERADO_V2_PILOT_COOPERADO_ID,
  isCooperadoV2PilotUser,
} from "../src/lib/cooperado-v2/cooperadoV2Pilot";

assert.equal(COOPERADO_V2_PILOT_COOPERADO_ID, "c_1782263929381_ncp55");

assert.equal(
  isCooperadoV2PilotUser({
    id: "u1",
    email: "o@test",
    name: "Orlando",
    role: "cooperado",
    cooperadoId: COOPERADO_V2_PILOT_COOPERADO_ID,
    active: true,
  }),
  true
);

assert.equal(
  isCooperadoV2PilotUser({
    id: "u2",
    email: "j@test",
    name: "Jeferson",
    role: "cooperado",
    cooperadoId: "c_1781981564381_w67gg",
    active: true,
  }),
  false
);

console.log("test-cooperado-v2-pilot-gate: ok");
