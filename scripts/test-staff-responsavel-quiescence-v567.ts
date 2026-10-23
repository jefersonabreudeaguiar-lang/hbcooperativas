/**
 * Responsável — pausa sync na troca de aba (v567).
 * npx tsx scripts/test-staff-responsavel-quiescence-v567.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");
const sync = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
const tier = readFileSync(join(ROOT, "src/lib/performance/staffConferenciaSyncTier.ts"), "utf8");
const quiescence = readFileSync(join(ROOT, "src/lib/staff/staffTabSwitchQuiescence.ts"), "utf8");

assert.match(quiescence, /QUIET_MS = 10_000/);
assert.match(sync, /staffResponsavelPausaSyncPesado\(\)/);
assert.match(tier, /staffResponsavelPausaSyncPesado\(\)\) return true/);

console.log("OK test-staff-responsavel-quiescence-v567");
