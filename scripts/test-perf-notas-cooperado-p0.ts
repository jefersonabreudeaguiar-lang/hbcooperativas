/**
 * Etapa 18 P0 — notas cooperado: manutenção de fila após UI interativa.
 * npx tsx scripts/test-perf-notas-cooperado-p0.ts
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

assert(notas.includes("scheduleCooperadoPostInteractiveTask"), "fila offline após interativo");
assert(notas.includes("notas_pedido_cooperado_shell"), "marca RQL shell notas");
assert(
  !notas.includes("void runCooperadoDeliveryQueueMaintenance().then(() => refreshCooperadoQueueIndicators());\n  }, [isCooperado"),
  "não dispara manutenção pesada síncrona no mount"
);

console.log("test-perf-notas-cooperado-p0.ts done.");
