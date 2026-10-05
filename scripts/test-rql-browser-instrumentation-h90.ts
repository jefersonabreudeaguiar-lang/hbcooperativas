/**
 * Fase B — smoke estático da instrumentação RQL no browser.
 * npx tsx scripts/test-rql-browser-instrumentation-h90.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

const marks = read("src/lib/performance/rqlMarks.ts");
const bootstrap = read("src/components/performance/AppSchedulerBootstrap.tsx");
const doc = read("docs/performance-rql-fase-b-homolog.md");

assert(marks.includes("markRqlRoutePaintReady"), "marca paint pós-rota");
assert(marks.includes("scheduleMarkRqlRoutePaintReady"), "agenda double rAF");
assert(marks.includes("summarizeRqlRouteTimings"), "sumário homolog transição→paint");
assert(bootstrap.includes("scheduleMarkRqlRoutePaintReady"), "bootstrap agenda paint");
assert(doc.includes("summarizeRqlRouteTimings"), "doc homolog referencia sumário");

if (process.exitCode !== 1) {
  console.log("\nFase B instrumentação RQL smoke OK");
}
