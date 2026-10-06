/**
 * Etapa 18 P1 — fila responsável e modal conferência lazy.
 * npx tsx scripts/test-perf-responsavel-fila-p1.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const hook = readFileSync(join(ROOT, "src/hooks/useResponsavelFilaConferencia.ts"), "utf8");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(hook.includes("!filaDetalhada) return []"), "lista fila só com aba detalhada");
assert(
  hook.includes("listNotasFilaConferenciaResponsavel") &&
    hook.includes("filaBadgeCount") &&
    hook.includes("filaDetalhada) return 0"),
  "badge usa contagem leve (lista fila sem sticky pesado)"
);
assert(notas.includes("{conferirModal && ("), "modal conferir monta só quando aberto");
assert(notas.includes('vistaResponsavel !== "fila"'), "zombie scan só na fila");

console.log("test-perf-responsavel-fila-p1.ts done.");
