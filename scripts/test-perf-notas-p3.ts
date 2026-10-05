/**
 * Etapa 18 P3 — modais lazy e selectors contratos/cooperados.
 * npx tsx scripts/test-perf-notas-p3.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(notas.includes("{avulsoModal && ("), "modal avulso lazy");
assert(notas.includes("{viewModal && ("), "modal detalhes lazy");
assert(notas.includes("notas_pedido_responsavel_shell"), "RQL responsavel notas");
assert(notas.includes("getContratosEntrega(d, coopId)"), "contratos via selector");
assert(notas.includes("!avulsoModal || !data"), "totais avulso só com modal");
assert(notas.includes("!conferirModal || !data"), "totais conferencia só com modal");

console.log("test-perf-notas-p3.ts done.");
