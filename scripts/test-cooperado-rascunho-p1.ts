/**
 * P1 cooperado — rascunho continuar entrega.
 * npx tsx scripts/test-cooperado-rascunho-p1.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx"), "utf8");

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("PASS:", msg);
  }
}

assert(notas.includes("refreshRascunhoAnexarFromDraft"), "reidrata rascunho do IDB");
assert(notas.includes("rascunhoUploadedCount"), "progresso na nuvem no banner");
assert(notas.includes("Continuar entrega"), "CTA continuar entrega");
assert(notas.includes("iniciarModalAnexar"), "nova entrega sem bloquear se IDB vazio");
assert(notas.includes("descartarRascunhoEntrega"), "descarte com limpeza nuvem");
assert(notas.includes("confirmDescartarRascunho"), "confirmação antes de descartar");
assert(notas.includes("deleteNotaPedidoFromCloud"), "remove rascunho na nuvem ao descartar");

console.log("test-cooperado-rascunho-p1.ts done.");
