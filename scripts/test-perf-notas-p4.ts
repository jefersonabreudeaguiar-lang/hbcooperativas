/**
 * Etapa 18 P4 — chunks lazy responsável + pipeline cooperado.
 * npx tsx scripts/test-perf-notas-p4.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const cooperado = readFileSync(
  join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoCooperadoMain.tsx"),
  "utf8"
);
const staff = readFileSync(
  join(ROOT, "src/app/(app)/notas-pedido/staff/NotasPedidoStaffResponsavelApp.tsx"),
  "utf8"
);
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
assert(
  cooperado.includes("loadCooperadoAnexarPipeline") && staff.includes("loadCooperadoAnexarPipeline"),
  "processar foto via chunk pipeline (cooperado + responsável)"
);
assert(
  !cooperado.includes("processDeliveryImage,") && !staff.includes("processDeliveryImage,"),
  "sem import estático processDeliveryImage"
);
assert(
  cooperado.includes('import("@/components/notas/NotasPedidoHistoricoResponsavel")') ||
    staff.includes('import("@/components/notas/NotasPedidoHistoricoResponsavel")'),
  "histórico lazy"
);
assert(
  cooperado.includes('import("@/components/cooperado/CooperadoEntregasPorMes")'),
  "entregas cooperado lazy"
);
assert(
  cooperado.includes("prefetchCooperadoAnexarPipeline()") && staff.includes("prefetchCooperadoAnexarPipeline()"),
  "prefetch ao abrir envio"
);

console.log("test-perf-notas-p4.ts done.");
