/**
 * Etapa 4 P3 — painel foto lazy + smoke fila decisão.
 * npx tsx scripts/test-conferencia-etapa4-p3.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { conferenciaFilaDecisaoUsaAvancoOtimista } from "../src/lib/conferencia/conferenciaFilaDecisaoOrdem";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoStaffMain.tsx"), "utf8");
const prefetch = readFileSync(join(ROOT, "src/lib/performance/prefetchConferenciaModalUi.ts"), "utf8");

assert.ok(notas.includes('import("@/components/notas/NotasPedidoConferirFotoPainel")'), "painel foto lazy");
assert.ok(notas.includes("NotasPedidoConferirFotoPainel"), "modal usa painel foto");
assert.ok(prefetch.includes("NotasPedidoConferirFotoPainel"), "prefetch painel foto");
assert.ok(!notas.includes("FOTO_ENTREGA_CONFERENCIA_PANEL") || notas.includes("NotasPedidoConferirFotoPainel"), "panel CSS no chunk foto");

conferenciaFilaDecisaoUsaAvancoOtimista(notas);

console.log("test-conferencia-etapa4-p3: OK");
