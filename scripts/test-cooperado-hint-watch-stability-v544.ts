/**
 * Contrato v544 — watcher de hint sem poll agressivo nem reinício por syncing.
 * npx tsx scripts/test-cooperado-hint-watch-stability-v544.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const watch = readFileSync(join(ROOT, "src/hooks/useCooperadoStaffRevisionWatch.ts"), "utf8");
const apresentacao = readFileSync(join(ROOT, "src/lib/cooperadoApresentacaoFinanceira.ts"), "utf8");
const badge = readFileSync(join(ROOT, "src/components/cooperado/CooperadoMobileBuildBadge.tsx"), "utf8");

assert.doesNotMatch(watch, /setInterval\(\(\) => void checkHint\(\)/);
assert.match(watch, /HINT_QUARANTINE_MS/);
assert.match(watch, /MIN_GAP_HINT_PROCESS_MS/);
assert.match(watch, /syncingRef\.current\) return/);
assert.doesNotMatch(watch, /enabled, syncing\]/);
assert.match(watch, /hintBootTimer/);

assert.match(apresentacao, /exibirComDadosLocais\) return true/);

assert.doesNotMatch(badge, /runClientReleaseShield\("cooperado_build_behind_cloud"\)/);

console.log("OK test-cooperado-hint-watch-stability-v544");
