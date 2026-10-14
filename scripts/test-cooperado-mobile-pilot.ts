/**
 * Piloto Jeferson — smoke estático.
 * npx tsx scripts/test-cooperado-mobile-pilot.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pilot = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoMobilePilot.ts"), "utf8");

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

console.log("test-cooperado-mobile-pilot.ts done.");
