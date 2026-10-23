/**
 * Etapa 2 — hint de lançamento puxa notas + operacional (v550).
 * npx tsx scripts/test-cooperado-etapa2-hint-notas-v550.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const watch = readFileSync(join(ROOT, "src/hooks/useCooperadoStaffRevisionWatch.ts"), "utf8");
const hintPull = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoLancamentoHintPull.ts"), "utf8");

assert.match(watch, /runCooperadoLancamentoHintPull/);
assert.doesNotMatch(watch, /runCooperadoMessengerOperacionalLightPull/);
assert.match(hintPull, /runCooperadoNotasContratosLightPull/);
assert.match(hintPull, /runCooperadoMessengerOperacionalLightPull/);

console.log("OK test-cooperado-etapa2-hint-notas-v550");
