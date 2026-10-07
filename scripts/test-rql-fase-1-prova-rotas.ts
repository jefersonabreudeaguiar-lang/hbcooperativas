/**
 * Fase 1 — smoke estático (instrumentação de prova de rotas).
 * npx tsx scripts/test-rql-fase-1-prova-rotas.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRqlPerfRouteReport, computePaintPercentiles } from "../src/lib/performance/rqlPerfReport.ts";

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
const report = read("src/lib/performance/rqlPerfReport.ts");
const staffTier = read("src/lib/performance/staffConferenciaSyncTier.ts");
const staffNotas = read("src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx");
const layout = read("src/app/(app)/layout.tsx");
const doc = read("docs/performance-rql-fase-1-prova-rotas.md");

assert(marks.includes("markRqlStaffNotasSubviewTransition"), "marca subview staff notas");
assert(marks.includes("markRqlInteractionPhase"), "marca interação Conferir");
assert(report.includes("buildRqlPerfRouteReport"), "relatório agregado");
assert(report.includes("computePaintPercentiles"), "percentis paint");
assert(staffTier.includes("staff_conferir_modal_open"), "marca abrir modal");
assert(staffTier.includes("staff_conferir_lancamento_foto_start"), "marca lançar foto");
assert(staffNotas.includes("markRqlStaffNotasSubviewTransition"), "staff main subview RQL");
assert(layout.includes("RqlPerfDebugBootstrap"), "bootstrap debug homolog");
assert(doc.includes("__hbRqlPerf.print"), "doc homolog relatório");

const empty = buildRqlPerfRouteReport();
assert(empty.routeTransitions.length === 0, "report SSR-safe vazio");
const pct = computePaintPercentiles([
  { transition: "a->b", toHop: "b", paintMs: 100 },
  { transition: "b->c", toHop: "c", paintMs: 180 },
]);
assert(pct.count === 2 && pct.p75 === 180, "percentil paint unitário");

if (process.exitCode !== 1) {
  console.log("\nFase 1 prova de rotas — smoke OK");
}
