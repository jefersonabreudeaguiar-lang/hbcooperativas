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
import {
  COOPERADO_JEFERSON_DUPLA_ENTRADA_MIN_MS,
  cooperadoJefersonDuplaEntradaDesbloqueado,
  registrarCooperadoJefersonForegroundEntrada,
  resetCooperadoJefersonDuplaEntradaForTests,
} from "../src/lib/cooperado/cooperadoJefersonDuplaEntradaAutoAtualizar";
import { COOPERADO_MOBILE_PILOT_COOPERADO_ID } from "../src/lib/cooperado/cooperadoMobilePilot";
import { cooperadoPwaMostraDadosDesatualizados } from "../src/lib/cooperado/cooperadoPwaDadosFreshness";
import {
  resolveCooperadoJefersonTabHref,
  resetCooperadoJefersonAbasMaterializadas,
} from "../src/lib/cooperado/cooperadoJefersonAbasDadosReais";

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

if (!COOPERADO_JEFERSON_SOMENTE_ATUALIZAR_MODE_ON) {
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(jeferson), false);
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(orlando), false);
} else {
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(orlando), true);
  assert.equal(isCooperadoJefersonSomenteAtualizarPilot(jeferson), true);
  assert.equal(cooperadoPwaMostraDadosDesatualizados(jeferson), false);
  assert.equal(resolveCooperadoJefersonTabHref("/notas-pedido/foo"), "/notas-pedido");
  assert.equal(resolveCooperadoJefersonTabHref("/precos"), "/precos");
  resetCooperadoJefersonAbasMaterializadas(jeferson.id);
  assert.equal(cooperadoJefersonBloqueiaSyncAutomatico(jeferson, {}), true);
  assert.equal(cooperadoJefersonBloqueiaSyncAutomatico(jeferson, { userInitiated: true }), false);
  assert.equal(
    withCooperadoJefersonEntregaSyncPermitido(() =>
      cooperadoJefersonBloqueiaSyncAutomatico(jeferson, { eventDriven: true })
    ),
    false
  );

  if (typeof sessionStorage !== "undefined") {
    resetCooperadoJefersonDuplaEntradaForTests(jeferson.id);
    registrarCooperadoJefersonForegroundEntrada(jeferson);
    assert.equal(cooperadoJefersonDuplaEntradaDesbloqueado(jeferson), false);
    const key = `hb.coop.jefersonDuplaEntrada.v2:${jeferson.id}`;
    const st = JSON.parse(sessionStorage.getItem(key) ?? "{}") as {
      firstAt: number;
      entradas: number;
      unlocked: boolean;
      lastAutoAt: number;
    };
    st.firstAt = Date.now() - COOPERADO_JEFERSON_DUPLA_ENTRADA_MIN_MS - 1;
    sessionStorage.setItem(key, JSON.stringify(st));
    registrarCooperadoJefersonForegroundEntrada(jeferson);
    assert.equal(cooperadoJefersonDuplaEntradaDesbloqueado(jeferson), true);
  }
}

console.log("test-cooperado-jeferson-somente-atualizar-gate: ok");
