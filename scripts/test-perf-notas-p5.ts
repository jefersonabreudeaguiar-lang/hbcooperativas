/**
 * Etapa 18 P5 — prefetch chunks responsável na rota Notas.
 * npx tsx scripts/test-perf-notas-p5.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const prefetch = readFileSync(join(ROOT, "src/lib/performance/prefetchStaffNotasPedidoUi.ts"), "utf8");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(prefetch.includes("prefetchStaffNotasPedidoUiChunks"), "helper P5");
assert(prefetch.includes("ResponsavelFilaCooperadosList"), "prefetch fila");
assert(prefetch.includes("NotasPedidoHistoricoResponsavel"), "prefetch histórico");
assert(notas.includes("prefetchStaffNotasPedidoUiChunks"), "Notas agenda prefetch idle");

console.log("test-perf-notas-p5.ts done.");
