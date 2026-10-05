/**
 * Etapa 18 P6 — prefetch sob demanda abas responsável (histórico/correções/aberto).
 * npx tsx scripts/test-perf-notas-p6.ts
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

assert(prefetch.includes("prefetchStaffNotasHistoricoChunk"), "prefetch histórico isolado");
assert(prefetch.includes("prefetchStaffNotasCorrecoesChunk"), "prefetch correções");
assert(prefetch.includes("prefetchStaffNotasLancamentosAbertoChunk"), "prefetch em aberto");
assert(notas.includes("onPointerEnter={prefetchStaffNotasHistoricoChunk}"), "hover histórico");
assert(notas.includes("abrirHistoricoResponsavel = () => {\n    prefetchStaffNotasHistoricoChunk()"), "click histórico");
assert(
  notas.includes('vistaConteudo === "historico"'),
  "tabela histórico gated por vista"
);

console.log("test-perf-notas-p6.ts done.");
