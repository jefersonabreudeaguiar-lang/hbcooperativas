/**
 * Etapa 18 P4 — chunks lazy responsável + pipeline cooperado.
 * npx tsx scripts/test-perf-notas-p4.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"), "utf8");
const prefetch = readFileSync(join(ROOT, "src/lib/performance/prefetchCooperadoAnexarPipeline.ts"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(prefetch.includes("prefetchCooperadoAnexarPipeline"), "prefetch pipeline");
assert(notas.includes("loadCooperadoAnexarPipeline"), "processar foto via chunk pipeline");
assert(!notas.includes("processDeliveryImage,"), "sem import estático processDeliveryImage");
assert(notas.includes('import("@/components/notas/NotasPedidoHistoricoResponsavel")'), "histórico lazy");
assert(notas.includes('import("@/components/cooperado/CooperadoEntregasPorMes")'), "entregas cooperado lazy");
assert(notas.includes("prefetchCooperadoAnexarPipeline()"), "prefetch ao abrir envio");

console.log("test-perf-notas-p4.ts done.");
