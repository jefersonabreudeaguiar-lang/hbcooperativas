/**
 * Piloto Jeferson — smoke estático.
 * npx tsx scripts/test-cooperado-mobile-pilot.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pilot = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilot.ts"), "utf8");
const perf = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilotPerf.ts"), "utf8");
const indicator = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilotIndicator.ts"), "utf8");
const star = readFileSync(join(ROOT, "src/components/cooperado/CooperadoMobilePilotStarBadge.tsx"), "utf8");
const hbPilot = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilotHbCredit.ts"), "utf8");
const bottomNav = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilotBottomNav.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(pilot.includes("c_1781981564381_w67gg"), "id piloto Jeferson");
assert(pilot.includes("jefersonabreudeaguiar@gmail.com"), "email piloto");
assert(pilot.includes("isCooperadoMobilePilot"), "export isCooperadoMobilePilot");
assert(pilot.includes("cooperadoMobilePilotOrDefault"), "helper piloto vs GA");
assert(perf.includes("COOPERADO_MOBILE_PILOT_TAB_DOM_POLICY"), "política DOM piloto perf");
assert(perf.includes("isCooperadoMobilePilotPerfActive"), "flag perf piloto");
assert(perf.includes("resolveCooperadoForegroundStaleMs"), "stale MS piloto");
assert(perf.includes("cooperadoCooperadoEntregasLeveUiForUser"), "entregas leve piloto");
assert(perf.includes('"/ficha-corrida"'), "gate financeiro L1 inclui Financeiro");
assert(indicator.includes("COOPERADO_MOBILE_PILOT_PENDING_REVISION"), "revisão piloto pendente");
assert(indicator.includes("cooperadoMobilePilotShowHeaderStar"), "estrela header piloto");
assert(star.includes("CooperadoMobilePilotStarBadge"), "componente estrela");
assert(hbPilot.includes("isCooperadoMobilePilotHbCreditUi"), "HB Créditos UI piloto");
assert(bottomNav.includes("COOPERADO_PILOT_HB_PAY_TAB_HREF"), "aba Pagar piloto");

console.log("test-cooperado-mobile-pilot.ts done.");
