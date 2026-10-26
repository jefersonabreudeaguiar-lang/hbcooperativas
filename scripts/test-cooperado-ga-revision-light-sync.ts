/**
 * GA: revisão na nuvem → sync leve debounced, sem operacional_full imediato no pulso.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const pulse = readFileSync(join(ROOT, "src/lib/bic/bicRevisionPulse.ts"), "utf8");
const light = readFileSync(join(ROOT, "src/lib/cooperado/cooperadoGaRevisionLightSync.ts"), "utf8");
const syncReq = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");

assert.match(pulse, /scheduleCooperadoGaValorRevisionLightSync\(user\)/);
assert.doesNotMatch(
  pulse,
  /requestSyncTier\("operacional_full"[\s\S]*isCooperadoMobileGaPromoted/,
  "pulso GA não enfileira operacional_full"
);
assert.match(light, /rematerializarCooperadoValorCardLeve/);
assert.match(light, /bicSession: true/);
assert.match(syncReq, /scheduleCooperadoGaValorRevisionLightSync\(session\)/);

console.log("OK test-cooperado-ga-revision-light-sync");
