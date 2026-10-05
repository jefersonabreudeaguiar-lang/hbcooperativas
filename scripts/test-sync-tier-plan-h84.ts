/**
 * HX 8.4 — plano de sync por tier.
 * npx tsx scripts/test-sync-tier-plan-h84.ts
 */
import assert from "node:assert/strict";
import { resolveSyncTierPlan84 } from "../src/lib/performance/syncPlan84.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..");

const staffNotas = resolveSyncTierPlan84("notas_delta", "staff");
assert.equal(staffNotas.pullNotas, true);
assert.equal(staffNotas.bidirectionalFull, false);
assert.equal(staffNotas.pullOperacional, false);

const staffFull = resolveSyncTierPlan84("operacional_full", "staff");
assert.equal(staffFull.bidirectionalFull, true);

const coop = resolveSyncTierPlan84("notas_delta", "cooperado");
assert.equal(coop.bidirectionalFull, true);

const syncReq = readFileSync(join(ROOT, "src/services/syncRequest.ts"), "utf8");
assert.ok(syncReq.includes('requestSyncTier("notas_delta"'), "AppSyncLight usa notas_delta");

const provider = readFileSync(join(ROOT, "src/components/sync/CooperativaSyncProvider.tsx"), "utf8");
assert.ok(provider.includes("syncStaffTieredPullFromCloud"), "runSync tier staff");

console.log("OK — test-sync-tier-plan-h84");
