/**
 * Piloto Jeferson isolado — demais cooperados fora do resolver unificado.
 * npx tsx scripts/test-cooperado-jeferson-piloto-isolamento.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BUILD_VERSION } from "../src/lib/appBuildVersion.ts";
import {
  cooperadoJefersonPilotoFinanceiroAtivo,
  COOPERADO_JEFERSON_PILOTO_FINANCEIRO_VERSION,
} from "../src/lib/cooperado/cooperadoJefersonPilotoFinanceiro.ts";
import { cooperadoInicioSincronizadoComFinanceiro } from "../src/lib/cooperado/cooperadoInicioSincronizadoComFinanceiro.ts";
import { cooperadoAReceberParidadeUnificadaPilotoJeferson } from "../src/lib/cooperado/cooperadoAReceberParidadeMobileUnificada.ts";
import { COOPERADO_MOBILE_PILOT_EMAIL } from "../src/lib/cooperado/cooperadoMobilePilot.ts";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

assert.ok(APP_BUILD_VERSION >= 631, "build 631+ Atualizar operacional_full piloto");
assert.ok(COOPERADO_JEFERSON_PILOTO_FINANCEIRO_VERSION >= 1);

const sync = read("src/lib/cooperado/cooperadoInicioSincronizadoComFinanceiro.ts");
assert.match(
  sync,
  /cooperadoInicioSincronizadoComFinanceiroPiloto/,
  "sync início/financeiro só no piloto Jeferson"
);
assert.ok(!sync.includes("isCooperadoMobileGaPromoted(user)"), "GA inteiro fora do sync experimental");

const piloto = read("src/lib/cooperado/cooperadoJefersonPilotoFinanceiro.ts");
assert.ok(piloto.includes("isCooperadoMobilePilot"));

const hook = read("src/hooks/useCooperadoParidadeExibicaoJeferson.ts");
assert.ok(hook.includes("cooperadoJefersonPilotoFinanceiroAtivo") || hook.includes("cooperadoAReceberParidadeUnificadaPilotoJeferson"));

const ficha = read("src/app/(app)/ficha-corrida/FichaCorridaContent.tsx");
assert.ok(ficha.includes("useCooperadoParidadeExibicaoJeferson"));
assert.ok(ficha.includes("paridadeCooperadoMobileLegacy"));

const contaCoop = read("src/app/(app)/conta-coop/ContaCoopContent.tsx");
assert.ok(!contaCoop.includes("useCooperadoParidadeExibicaoJeferson"), "responsável fora do piloto cooperado");

const syncReq = read("src/services/syncRequest.ts");
assert.ok(
  syncReq.includes("cooperadoJefersonPilotoFinanceiroAtivo(user)") &&
    syncReq.includes("return false"),
  "piloto Jeferson usa operacional_full no Atualizar"
);

const jefersonUser = {
  id: "u1",
  role: "cooperado" as const,
  email: COOPERADO_MOBILE_PILOT_EMAIL,
  cooperadoId: "c_1781981564381_w67gg",
  cooperativaId: "coop1",
};
const outroUser = {
  id: "u2",
  role: "cooperado" as const,
  email: "outro@test.com",
  cooperadoId: "c_outro",
  cooperativaId: "coop1",
};

assert.equal(cooperadoJefersonPilotoFinanceiroAtivo(jefersonUser), true);
assert.equal(cooperadoJefersonPilotoFinanceiroAtivo(outroUser), false);
assert.equal(cooperadoInicioSincronizadoComFinanceiro(jefersonUser), true);
assert.equal(cooperadoInicioSincronizadoComFinanceiro(outroUser), false);
assert.equal(
  cooperadoAReceberParidadeUnificadaPilotoJeferson(jefersonUser),
  cooperadoJefersonPilotoFinanceiroAtivo(jefersonUser)
);

console.log("OK — test-cooperado-jeferson-piloto-isolamento");
