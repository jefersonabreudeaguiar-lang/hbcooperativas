/**
 * Etapa 18 P2 — selectors cooperado e modais sob demanda.
 * npx tsx scripts/test-perf-notas-cooperado-p2.ts
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

assert(notas.includes("deferredStatusFilter = useDeferredValue(statusFilter)"), "filtro cooperado adiado");
assert(notas.includes("resumosMensaisCooperado"), "resumos entregas via selector");
assert(notas.includes("abaCooperado !== \"entregas\") return []"), "BIC entregas só na aba entregas");
assert(notas.includes("{anexarModal && ("), "modal anexar monta sob demanda");
assert(notas.includes("isCooperado || !filaDetalhada"), "memos fila responsável gated");

console.log("test-perf-notas-cooperado-p2.ts done.");
