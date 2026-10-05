/**
 * Etapa 18 P7 — gate suíte perf+fluxos inclui P5–P7 e instrumentação Fase B.
 * npx tsx scripts/test-perf-notas-p7.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const suite = readFileSync(join(ROOT, "scripts/run-suite-perf-fluxos.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(suite.includes("test-perf-notas-p5.ts"), "suíte P5");
assert(suite.includes("test-perf-notas-p6.ts"), "suíte P6");
assert(suite.includes("test-perf-notas-p7.ts"), "suíte P7");
assert(suite.includes("test-rql-browser-instrumentation-h90.ts"), "suíte Fase B RQL");

console.log("test-perf-notas-p7.ts done.");
