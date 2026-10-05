/**
 * Etapa 4 P0 — chunk lazy fotos conferência + guard exclusão pendente.
 * npx tsx scripts/test-conferencia-etapa4-p0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notaBloqueadaConferenciaPorExclusaoPendente } from "../src/lib/conferencia/conferenciaAbrirGuard";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const notas = readFileSync(join(ROOT, "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"), "utf8");
const loader = readFileSync(join(ROOT, "src/lib/performance/loadConferenciaFotoPrefetch.ts"), "utf8");

assert.ok(loader.includes('import("@/services/conferenciaFotoPrefetch")'), "dynamic import conferenciaFotoPrefetch");
assert.ok(loader.includes("prefetchConferenciaFotoPrefetchModule"), "prefetch público");
assert.ok(!notas.includes('from "@/services/conferenciaFotoPrefetch"'), "sem import estático conferenciaFotoPrefetch");
assert.ok(notas.includes("loadConferenciaFotoPrefetchModule"), "NotasPedido carrega chunk lazy");
assert.ok(notas.includes("prefetchConferenciaFotoPrefetchModule"), "prefetch na fila/conferência");
assert.ok(notas.includes("notaBloqueadaConferenciaPorExclusaoPendente"), "guard exclusão pendente");

assert.equal(notaBloqueadaConferenciaPorExclusaoPendente("n1", new Set(["n1"])), true);
assert.equal(notaBloqueadaConferenciaPorExclusaoPendente("n1", new Set()), false);
assert.equal(notaBloqueadaConferenciaPorExclusaoPendente("n1", undefined), false);

console.log("test-conferencia-etapa4-p0: OK");
