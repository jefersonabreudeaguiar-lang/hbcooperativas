/**
 * Etapa 4 — Atualizar GA prefere sync base com fatia local (v552).
 * npx tsx scripts/test-cooperado-etapa4-manual-v552.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const sync = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
const queue = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoPostDeployQueue.ts"), "utf8");

assert.match(sync, /cooperadoManualPrefereSyncBaseInformacoes/);
assert.match(sync, /runCooperadoGaSyncBaseInformacoesFinanceiras/);
assert.match(sync, /sync_base_financeira/);
assert.match(queue, /cooperadoPostDeployAckMatches\(APP_BUILD_VERSION/);

console.log("OK test-cooperado-etapa4-manual-v552");
